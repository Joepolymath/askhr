import json

from sqlalchemy import select

from app.db import session_factory
from app.models import ChatLog, Person
from app.rag.chat import answer, unknown_message
from tests.conftest import upload


def parse_sse(body: str) -> list[tuple[str, dict]]:
    events = []
    for block in body.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines())
        events.append((lines["event"], json.loads(lines["data"])))
    return events


async def test_no_context_skips_llm_and_returns_unknown(client, fake_llm):
    fake_llm.last_system = None
    resp = await client.post("/api/chat", json={"question": "What is the dental plan?", "employee_name": "Sam"})
    events = parse_sse(resp.text)
    assert [e for e, _ in events][0] == "meta"
    done = events[-1][1]
    assert events[-1][0] == "done"
    assert done["unanswered"] is True
    assert done["answer"] == unknown_message()
    assert done["citations"] == []
    assert fake_llm.last_system is None  # nothing to answer from -> LLM not called

    async with session_factory()() as s:
        row = (await s.execute(select(ChatLog))).scalar_one()
    assert row.unanswered and row.employee_name == "Sam" and row.answer == unknown_message()


async def test_sentinel_replaced_with_standard_message(client, admin_headers, fake_llm):
    await upload(client, admin_headers, "Leave Policy", b"## Annual Leave\n\n25 days of annual leave.\n")
    fake_llm.responder = lambda system, msgs: "NO_ANSWER"
    result = await answer("What is the annual leave carry-over limit?")
    assert result.unanswered is True
    assert result.answer == unknown_message()
    assert result.citations == []


async def test_directory_question_answered_without_chunks(fake_llm):
    async with session_factory()() as s:
        s.add(Person(name="Priya Raman", role="Chief Technology Officer", department="Engineering"))
        await s.commit()
    fake_llm.responder = lambda system, msgs: (
        "The CTO is Priya Raman." if "Priya Raman" in system else "NO_ANSWER"
    )
    result = await answer("Who is the CTO?")
    assert result.unanswered is False
    assert "Priya Raman" in result.answer
    assert "no relevant documents" in fake_llm.last_system


async def test_answer_with_citations(client, admin_headers, fake_llm):
    await upload(client, admin_headers, "Leave Policy", b"## Annual Leave\n\nEmployees get 25 days of annual leave.\n")
    fake_llm.responder = lambda system, msgs: "You get 25 days of annual leave [1]. See also [9]."
    result = await answer("How many days of annual leave do employees get?")
    assert result.unanswered is False
    assert [c.index for c in result.citations] == [1]  # [9] doesn't exist and is dropped
    c = result.citations[0]
    assert c.document_title == "Leave Policy" and c.section == "Annual Leave" and "25 days" in c.snippet


async def test_feedback_recorded(client, fake_llm):
    events = parse_sse((await client.post("/api/chat", json={"question": "hi"})).text)
    chat_id = events[0][1]["chat_id"]
    assert (await client.post(f"/api/chat/{chat_id}/feedback", json={"rating": -1})).status_code == 204
    async with session_factory()() as s:
        assert (await s.execute(select(ChatLog.rating))).scalar_one() == -1
