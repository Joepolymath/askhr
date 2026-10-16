from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_admin
from app.db import get_session
from app.models import ChatLog
from app.schemas import ChatLogOut, InsightsOut

router = APIRouter(prefix="/api/admin/insights", tags=["insights"], dependencies=[Depends(require_admin)])

LIMIT = 100


@router.get("", response_model=InsightsOut)
async def insights(session: AsyncSession = Depends(get_session)) -> InsightsOut:
    async def rows(*where):
        q = select(ChatLog).where(*where).order_by(ChatLog.created_at.desc()).limit(LIMIT)
        return [ChatLogOut.model_validate(r) for r in (await session.execute(q)).scalars()]

    counts = (
        await session.execute(
            select(
                func.count(),
                func.count().filter(ChatLog.unanswered.is_(True)),
                func.count().filter(ChatLog.rating == 1),
                func.count().filter(ChatLog.rating == -1),
            ).select_from(ChatLog)
        )
    ).one()

    return InsightsOut(
        total_questions=counts[0],
        unanswered_count=counts[1],
        thumbs_up=counts[2],
        thumbs_down=counts[3],
        recent=await rows(),
        unanswered=await rows(ChatLog.unanswered.is_(True)),
        rated=await rows(ChatLog.rating.is_not(None)),
    )
