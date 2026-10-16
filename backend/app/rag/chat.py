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

from sqlalchemy import select

from app.config import get_settings
from app.db import session_factory
from app.models import ChatLog, CompanyInfo, Person
from app.providers.base import ChatMessage
from app.providers.factory import get_embedder, get_llm
from app.rag.prompt import NO_ANSWER, build_system_prompt
from app.rag.retrieval import Retrieved, search
from app.schemas import Citation, HistoryTurn

log = logging.getLogger(__name__)

MAX_HISTORY_TURNS = 6
SNIPPET_CHARS = 320
_CITE = re.compile(r"\[(\d+(?:\s*,\s*\d+)*)\]")
# Fallback detection for when the model writes its own "I don't know" instead
# of the sentinel. Used only to flag the question for HR's Insights page.
_UNSURE = re.compile(
    r"\b(I don'?t know|I do not know|I couldn'?t find|I could not find|not (?:mentioned|covered|included|specified) in)\b",
    re.IGNORECASE,
)


def unknown_message() -> str:
    return (
        "I don't know the answer to that based on the HR knowledge base. "
        f"Please contact HR ({get_settings().hr_contact}) and they'll be able to help."
    )


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


def _retrieval_query(question: str, history: list[HistoryTurn]) -> str:
    # Include the previous user turn so follow-ups ("what about contractors?")
    # retrieve chunks about the original topic.
    last_user = next((t.content for t in reversed(history) if t.role == "user"), None)
    return f"{last_user}\n{question}" if last_user else question


@dataclass
class AnswerResult:
    chat_id: uuid.UUID
    answer: str
    citations: list[Citation]
    unanswered: bool
    top_similarity: float | None
    retrieved: list[Retrieved] = field(default_factory=list)


async def answer_events(
    question: str, history: list[HistoryTurn], employee_name: str | None
) -> AsyncIterator[dict]:
    settings = get_settings()
    question = question.strip()

    async with session_factory()() as session:
        # 1. Embed and retrieve.
        query_vec = (await get_embedder().embed([_retrieval_query(question, history)]))[0]
        hits = await search(session, query_vec, settings.top_k)
        sources = [h for h in hits if h.similarity >= settings.similarity_threshold]
        top_similarity = hits[0].similarity if hits else None

        # 2. Structured context that is always included.
        people = list((await session.execute(select(Person).order_by(Person.name))).scalars())
        company = await session.get(CompanyInfo, 1)
        company_text = company.content if company else ""

        log_row = ChatLog(employee_name=employee_name, question=question, top_similarity=top_similarity)
        session.add(log_row)
        await session.commit()
        yield {"event": "meta", "data": {"chat_id": str(log_row.id)}}

        # 3. Nothing at all to answer from: skip the LLM entirely.
        if not sources and not people and not company_text.strip():
            final, unanswered = unknown_message(), True
            yield {"event": "token", "data": {"text": final}}
        else:
            # With no passing chunks the LLM still runs, but only against the
            # directory + company info, and must emit NO_ANSWER if those don't
            # answer it. That is how "Who is the CTO?" works without a document
            # while "What's the dental plan?" still gets the standard reply.
            system = build_system_prompt(company_text, people, sources)
            messages = _history_messages(history) + [ChatMessage("user", question)]
            final, unanswered = "", False
            try:
                async for event in _stream_with_sentinel(system, messages):
                    if event is None:
                        unanswered = True
                        final = unknown_message()
                        yield {"event": "token", "data": {"text": final}}
                        break
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
                unanswered, final = True, unknown_message()
            if not unanswered and not _cited_indices(final) and _UNSURE.search(final):
                unanswered = True

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
            )
            for i in cited
        ]

        log_row.answer = final
        log_row.citations = [c.model_dump(mode="json") for c in citations]
        log_row.unanswered = unanswered
        await session.commit()

        yield {
            "event": "done",
            "data": {
                "chat_id": str(log_row.id),
                "answer": final,  # authoritative final text (client replaces streamed text)
                "citations": [c.model_dump(mode="json") for c in citations],
                "unanswered": unanswered,
            },
            "_retrieved": hits,  # internal: for eval/debug, never serialised
        }


async def _stream_with_sentinel(system: str, messages: list[ChatMessage]) -> AsyncIterator[str | None]:
    """Stream text, but hold back the first few characters until we know
    whether the model is emitting the NO_ANSWER sentinel. Yields None if so."""
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
                yield None
                return
            if NO_ANSWER.startswith(stripped):
                continue  # still could be the sentinel; keep buffering
            decided = True
            yield head
    if not decided:
        stripped = head.strip()
        if not stripped or NO_ANSWER.startswith(stripped):
            yield None
        else:
            yield head


async def answer(question: str, history: list[HistoryTurn] | None = None, employee_name: str | None = None) -> AnswerResult:
    """Run the full pipeline and return the final result (used by eval and tests)."""
    result: AnswerResult | None = None
    chat_id: uuid.UUID | None = None
    async for event in answer_events(question, history or [], employee_name):
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
                top_similarity=hits[0].similarity if hits else None,
                retrieved=hits,
            )
    assert result is not None
    return result
