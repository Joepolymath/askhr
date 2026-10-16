import re
from collections import defaultdict
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_admin
from app.db import get_session
from app.models import ChatLog
from app.schemas import ConflictGroup, DismissGapIn, Gap, InsightsOut, InsightsPeriod, RecentQuestion

router = APIRouter(prefix="/api/admin/insights", tags=["insights"], dependencies=[Depends(require_admin)])

RECENT_LIMIT = 50
GAP_LIMIT = 20
# Unanswered questions scanned for grouping; plenty for a company's HR traffic.
SCAN_LIMIT = 5000
_NON_WORD = re.compile(r"[^\w\s]")


def question_key(question: str) -> str:
    """Group "How many sick days?" and "how many sick days" as one gap."""
    return " ".join(_NON_WORD.sub(" ", question.lower()).split())


def period_window(period: InsightsPeriod, now: datetime) -> tuple[datetime, datetime, datetime]:
    """(previous start, start, end) for the period and the one before it."""
    week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "this_week":
        return week_start - timedelta(days=7), week_start, now
    if period == "last_week":
        return week_start - timedelta(days=14), week_start - timedelta(days=7), week_start
    return now - timedelta(days=60), now - timedelta(days=30), now


def _result(row: ChatLog) -> str:
    return "not_found" if row.unanswered else "conflict" if row.conflict else "answered"


@router.get("", response_model=InsightsOut)
async def insights(
    period: InsightsPeriod = Query("this_week"), session: AsyncSession = Depends(get_session)
) -> InsightsOut:
    prev_start, start, end = period_window(period, datetime.now(UTC))
    in_period = (ChatLog.created_at >= start, ChatLog.created_at < end)

    counts = (
        await session.execute(
            select(
                func.count(),
                func.count().filter(ChatLog.unanswered.is_(True)),
                func.count().filter(ChatLog.rating.is_not(None)),
                func.count().filter(ChatLog.rating == 1),
            ).where(*in_period)
        )
    ).one()
    previous_total = (
        await session.execute(
            select(func.count()).select_from(ChatLog).where(ChatLog.created_at >= prev_start, ChatLog.created_at < start)
        )
    ).scalar_one()

    recent_rows = (
        await session.execute(select(ChatLog).where(*in_period).order_by(ChatLog.created_at.desc()).limit(RECENT_LIMIT))
    ).scalars()
    recent = [
        RecentQuestion(
            id=r.id, question=r.question, answer=r.answer, citations=r.citations,
            result=_result(r), rating=r.rating, created_at=r.created_at,
        )
        for r in recent_rows
    ]

    # Gaps: unanswered questions in the period, grouped by wording, most-asked first.
    unanswered = (
        await session.execute(
            select(ChatLog)
            .where(*in_period, ChatLog.unanswered.is_(True), ChatLog.gap_dismissed.is_(False))
            .order_by(ChatLog.created_at.desc())
            .limit(SCAN_LIMIT)
        )
    ).scalars()
    groups: dict[str, list[ChatLog]] = defaultdict(list)
    for row in unanswered:
        groups[question_key(row.question)].append(row)
    gaps = sorted(
        (
            Gap(
                key=key,
                question=rows[0].question,  # newest wording
                count=len(rows),
                last_asked=rows[0].created_at,
                closest_document_title=next((r.closest_document_title for r in rows if r.closest_document_title), None),
            )
            for key, rows in groups.items()
        ),
        key=lambda g: (-g.count, -g.last_asked.timestamp()),
    )[:GAP_LIMIT]

    # Disagreements: grouped by the pair (or set) of documents involved.
    conflict_rows = (
        await session.execute(
            select(ChatLog).where(*in_period, ChatLog.conflict.is_(True)).order_by(ChatLog.created_at.desc())
        )
    ).scalars()
    conflict_groups: dict[tuple[str, ...], list[ChatLog]] = defaultdict(list)
    for row in conflict_rows:
        titles = tuple(sorted({c["document_title"] for c in row.citations}))
        if len(titles) >= 2:
            conflict_groups[titles].append(row)
    conflicts = sorted(
        (
            ConflictGroup(
                documents=list(titles), count=len(rows), last_question=rows[0].question, last_asked=rows[0].created_at
            )
            for titles, rows in conflict_groups.items()
        ),
        key=lambda c: -c.count,
    )

    return InsightsOut(
        period=period,
        start=start,
        end=end,
        total_questions=counts[0],
        previous_total=previous_total,
        answered_count=counts[0] - counts[1],
        not_found_count=counts[1],
        rated_count=counts[2],
        thumbs_up=counts[3],
        gaps=gaps,
        conflicts=conflicts,
        recent=recent,
    )


@router.post("/gaps/dismiss", status_code=status.HTTP_204_NO_CONTENT)
async def dismiss_gap(body: DismissGapIn, session: AsyncSession = Depends(get_session)) -> None:
    """Hide every unanswered question with this wording from the gap list."""
    rows = (
        await session.execute(
            select(ChatLog.id, ChatLog.question)
            .where(ChatLog.unanswered.is_(True), ChatLog.gap_dismissed.is_(False))
            .limit(SCAN_LIMIT)
        )
    ).all()
    ids = [row_id for row_id, q in rows if question_key(q) == body.key]
    if ids:
        await session.execute(update(ChatLog).where(ChatLog.id.in_(ids)).values(gap_dismissed=True))
        await session.commit()
