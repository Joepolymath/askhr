"""Chat pipeline: embed -> retrieve -> prompt -> stream -> cite -> log.

`answer_events` yields plain dicts that the router serialises as SSE. The eval
script and tests call `answer()`, which runs the same pipeline to completion.
"""
import logging
import re
import uuid
from collections.abc import AsyncIterator
from contextlib import aclosing
from dataclasses import dataclass, field

from sqlalchemy import func, select

from app.config import get_settings
from app.db import session_factory
from app.models import ChatLog, CompanyInfo, Document, DocStatus, Person
from app.providers.base import ChatMessage
from app.providers.factory import get_embedder, get_llm
from app.rag.prompt import CONFLICT, NO_ANSWER, build_system_prompt, company_text
from app.rag.retrieval import Retrieved, search
from app.schemas import Citation, HistoryTurn

log = logging.getLogger(__name__)

MAX_HISTORY_TURNS = 6
# An unanswered question names its closest document in Insights ("Leave Policy
# may only partly cover it") only when the match is clearly stronger than the
# retrieval cut-off; weaker matches are noise ("no matching document").
PARTIAL_MATCH_MARGIN = 0.15
SNIPPET_CHARS = 320
_CITE = re.compile(r"\[(\d+(?:\s*,\s*\d+)*)\]")
# Fallback detection for when the model writes its own "I don't know" instead
# of the sentinel. Used only to flag the question for HR's Insights page.
_UNSURE = re.compile(
    r"\b(I don'?t know|I do not know|I couldn'?t find|I could not find|not (?:mentioned|covered|included|specified) in)\b",
    re.IGNORECASE,
)


def unknown_message(contact: str | None = None) -> str:
    return (
        "I don't know the answer to that based on the HR knowledge base. "
        f"Please contact HR ({contact or get_settings().hr_contact}) and they'll be able to help."
    )


# Signals from _stream_with_sentinel, distinct from text pieces.
_NO_ANSWER_SIGNAL = object()
_CONFLICT_SIGNAL = object()


def _cited_indices(answer: str) -> list[int]:
    found: set[int] = set()
    for group in _CITE.findall(answer):
        found.update(int(n) for n in group.split(","))
    return sorted(found)


def _snippet(text: str) -> str:
    text = " ".join(text.split())
    return text if len(text) <= SNIPPET_CHARS else text[:SNIPPET_CHARS].rsplit(" ", 1)[0] + "…"


def _history_messages(history: list[HistoryTurn]) -> list[ChatMessage]:
    # Old [n] markers point at sources from earlier turns, which are not in this
    # turn's prompt, so strip them to avoid confusing the model.
    return [ChatMessage(t.role, _CITE.sub("", t.content).strip()) for t in history[-MAX_HISTORY_TURNS:]]


def _retrieval_queries(question: str, history: list[HistoryTurn]) -> list[str]:
    """The question on its own, plus (for follow-ups) the question with the
    previous user turn, so "what about contractors?" still finds chunks about
    the original topic. Searching both keeps a follow-up like "how many sick
    days?" from being swamped by the previous topic's documents."""
    last_user = next((t.content for t in reversed(history) if t.role == "user"), None)
    return [question, f"{last_user}\n{question}"] if last_user else [question]


async def _retrieve(session, question: str, history: list[HistoryTurn], top_k: int) -> list[Retrieved]:
    vectors = await get_embedder().embed(_retrieval_queries(question, history))
    best: dict[uuid.UUID, Retrieved] = {}
    for vec in vectors:
        for hit in await search(session, vec, top_k):
            if hit.chunk_id not in best or hit.similarity > best[hit.chunk_id].similarity:
                best[hit.chunk_id] = hit
    return sorted(best.values(), key=lambda h: h.similarity, reverse=True)[:top_k]


@dataclass
class AnswerResult:
    chat_id: uuid.UUID
    answer: str
    citations: list[Citation]
    unanswered: bool
    conflict: bool
    top_similarity: float | None
    retrieved: list[Retrieved] = field(default_factory=list)


async def answer_events(question: str, history: list[HistoryTurn]) -> AsyncIterator[dict]:
    """Events: meta, status*, token*, then done (or error).

    `status` events drive the "Searched N documents / Found N passages" steps
    in the UI while the answer is being prepared."""
    settings = get_settings()
    question = question.strip()

    async with session_factory()() as session:
        searchable = (
            await session.execute(
                select(func.count())
                .select_from(Document)
                .where(Document.is_active.is_(True), Document.status == DocStatus.ready)
            )
        ).scalar_one()

        # 1. Embed and retrieve.
        hits = await _retrieve(session, question, history, settings.top_k)
        sources = [h for h in hits if h.similarity >= settings.similarity_threshold]
        top_similarity = hits[0].similarity if hits else None

        # 2. Structured context that is always included. People whose access
        # was removed have left, so they no longer answer "who is..." questions.
        people = list(
            (await session.execute(select(Person).where(Person.has_access.is_(True)).order_by(Person.name))).scalars()
        )
        company = await session.get(CompanyInfo, 1)
        about = company_text(company)
        hr_contact = (company.hr_contact_email or company.hr_contact_name) if company else None

        log_row = ChatLog(question=question, top_similarity=top_similarity)
        session.add(log_row)
        await session.commit()
        yield {"event": "meta", "data": {"chat_id": str(log_row.id)}}
        yield {"event": "status", "data": {"step": "searched", "documents": searchable}}
        source_titles = list(dict.fromkeys(s.document_title for s in sources))
        yield {"event": "status", "data": {"step": "found", "passages": len(sources), "documents": source_titles}}

        # 3. Nothing at all to answer from: skip the LLM entirely.
        conflict = False
        if not sources and not people and not about:
            final, unanswered = unknown_message(hr_contact), True
            yield {"event": "token", "data": {"text": final}}
        else:
            # With no passing chunks the LLM still runs, but only against the
            # directory + company info, and must emit NO_ANSWER if those don't
            # answer it. That is how "Who is the CTO?" works without a document
            # while "What's the dental plan?" still gets the standard reply.
            system = build_system_prompt(about, people, sources)
            messages = _history_messages(history) + [ChatMessage("user", question)]
            final, unanswered = "", False
            try:
                async for event in _stream_with_sentinel(system, messages):
                    if event is _NO_ANSWER_SIGNAL:
                        unanswered = True
                        final = unknown_message(hr_contact)
                        yield {"event": "token", "data": {"text": final}}
                        break
                    if event is _CONFLICT_SIGNAL:
                        conflict = True
                        yield {"event": "status", "data": {"step": "conflict"}}
                        continue
                    final += event
                    yield {"event": "token", "data": {"text": event}}
            except Exception:
                log.exception("LLM call failed")
                log_row.answer = "[error: LLM call failed]"
                await session.commit()
                yield {"event": "error", "data": {"message": "Sorry, something went wrong. Please try again."}}
                return
            if not unanswered and NO_ANSWER in final:
                # Sentinel appeared after some text; treat as unknown.
                unanswered, final = True, unknown_message(hr_contact)
            if not unanswered and not _cited_indices(final) and _UNSURE.search(final):
                unanswered = True
            final = final.replace(CONFLICT, "").strip() if not unanswered else final

        # 4. Citations: only the sources the answer actually references.
        cited = [] if unanswered else [i for i in _cited_indices(final) if 1 <= i <= len(sources)]
        citations = [
            Citation(
                index=i,
                document_id=sources[i - 1].document_id,
                document_title=sources[i - 1].document_title,
                section=sources[i - 1].section,
                page=sources[i - 1].page,
                snippet=_snippet(sources[i - 1].text),
                similarity=round(sources[i - 1].similarity, 4),
                chunk_id=sources[i - 1].chunk_id,
                document_updated_at=sources[i - 1].document_updated_at,
            )
            for i in cited
        ]
        # A "disagreement" needs two different documents behind it.
        conflict = conflict and not unanswered and len({c.document_id for c in citations}) >= 2

        log_row.answer = final
        log_row.citations = [c.model_dump(mode="json") for c in citations]
        log_row.unanswered = unanswered
        log_row.conflict = conflict
        if unanswered and sources and sources[0].similarity >= settings.similarity_threshold + PARTIAL_MATCH_MARGIN:
            log_row.closest_document_title = sources[0].document_title
        await session.commit()

        yield {
            "event": "done",
            "data": {
                "chat_id": str(log_row.id),
                "answer": final,  # authoritative final text (client replaces streamed text)
                "citations": [c.model_dump(mode="json") for c in citations],
                "unanswered": unanswered,
                "conflict": conflict,
            },
            "_retrieved": hits,  # internal: for eval/debug, never serialised
        }


async def _stream_with_sentinel(system: str, messages: list[ChatMessage]) -> AsyncIterator[object]:
    """Stream text, but hold back the first few characters until we know
    whether the model is emitting a marker. Yields _NO_ANSWER_SIGNAL (and
    stops) for NO_ANSWER, or _CONFLICT_SIGNAL followed by the remaining text
    for CONFLICT."""
    head = ""
    decided = False
    # aclosing: stopping early (sentinel found) must still close the provider stream.
    async with aclosing(get_llm().stream(system, messages)) as pieces:
        async for piece in pieces:
            if decided:
                yield piece
                continue
            head += piece
            stripped = head.lstrip()
            if stripped.startswith(NO_ANSWER):
                yield _NO_ANSWER_SIGNAL
                return
            if stripped.startswith(CONFLICT):
                yield _CONFLICT_SIGNAL
                decided = True
                rest = stripped[len(CONFLICT) :].lstrip()
                if rest:
                    yield rest
                continue
            if NO_ANSWER.startswith(stripped) or CONFLICT.startswith(stripped):
                continue  # still could be a marker; keep buffering
            decided = True
            yield head
    if not decided:
        stripped = head.strip()
        if not stripped or NO_ANSWER.startswith(stripped):
            yield _NO_ANSWER_SIGNAL
        else:
            yield head


async def answer(question: str, history: list[HistoryTurn] | None = None) -> AnswerResult:
    """Run the full pipeline and return the final result (used by eval and tests)."""
    result: AnswerResult | None = None
    chat_id: uuid.UUID | None = None
    async for event in answer_events(question, history or []):
        if event["event"] == "meta":
            chat_id = uuid.UUID(event["data"]["chat_id"])
        elif event["event"] == "error":
            raise RuntimeError(event["data"]["message"])
        elif event["event"] == "done":
            hits = event["_retrieved"]
            d = event["data"]
            result = AnswerResult(
                chat_id=chat_id or uuid.UUID(d["chat_id"]),
                answer=d["answer"],
                citations=[Citation(**c) for c in d["citations"]],
                unanswered=d["unanswered"],
                conflict=d["conflict"],
                top_similarity=hits[0].similarity if hits else None,
                retrieved=hits,
            )
    assert result is not None
    return result
