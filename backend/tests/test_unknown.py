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


async def test_no_context_skips_llm_and_returns_unknown(client, fake_llm, employee_headers):
    # People without access aren't prompt context, so this is an empty directory.
    async with session_factory()() as s:
        for p in (await s.execute(select(Person))).scalars():
            p.has_access = False
        await s.commit()
    fake_llm.last_system = None
    result = await answer("What is the dental plan?")
    assert result.unanswered is True
    assert result.answer == unknown_message()
    assert result.citations == []
    assert fake_llm.last_system is None  # nothing to answer from -> LLM not called

    async with session_factory()() as s:
        row = (await s.execute(select(ChatLog))).scalar_one()
    assert row.unanswered and row.employee_name is None and row.answer == unknown_message()


async def test_chat_stream_events(client, fake_llm, employee_headers):
    resp = await client.post("/api/chat", headers=employee_headers, json={"question": "What is the dental plan?"})
    events = parse_sse(resp.text)
    assert [e for e, _ in events][0] == "meta"
    assert [d["step"] for e, d in events if e == "status"] == ["searched", "found"]
    done = events[-1][1]
    assert events[-1][0] == "done"
    assert done["unanswered"] is True and done["conflict"] is False
    assert done["answer"] == unknown_message()


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


async def test_feedback_recorded(client, fake_llm, employee_headers):
    events = parse_sse((await client.post("/api/chat", headers=employee_headers, json={"question": "hi"})).text)
    chat_id = events[0][1]["chat_id"]
    resp = await client.post(f"/api/chat/{chat_id}/feedback", headers=employee_headers, json={"rating": -1})
    assert resp.status_code == 204
    async with session_factory()() as s:
        assert (await s.execute(select(ChatLog.rating))).scalar_one() == -1


async def test_unknown_uses_company_hr_contact(client, admin_headers, fake_llm):
    await client.put("/api/admin/company", headers=admin_headers, json={"name": "Northwind", "hr_contact_email": "hr@northwind.test"})
    result = await answer("What is the dental plan?")
    assert result.unanswered and "hr@northwind.test" in result.answer


async def test_conflict_marker_flags_answer(client, admin_headers, fake_llm):
    await upload(client, admin_headers, "Leave Policy", b"## Sick Leave\n\nEmployees get 12 days of sick leave.\n")
    await upload(client, admin_headers, "Handbook", b"## Sick Leave\n\nStaff get 10 days of sick leave.\n")
    fake_llm.responder = lambda system, msgs: "CONFLICT:\nThe Leave Policy says 12 days [1], the Handbook says 10 [2]."
    result = await answer("How many days of sick leave do employees get?")
    assert result.conflict is True and result.unanswered is False
    assert not result.answer.startswith("CONFLICT")
    assert len({c.document_id for c in result.citations}) == 2


async def test_conflict_needs_two_documents(client, admin_headers, fake_llm):
    await upload(client, admin_headers, "Leave Policy", b"## Sick Leave\n\nEmployees get 12 days of sick leave.\n")
    fake_llm.responder = lambda system, msgs: "CONFLICT: You get 12 days [1]."
    result = await answer("How many days of sick leave do employees get?")
    assert result.conflict is False and result.answer == "You get 12 days [1]."


async def test_source_context_and_file(client, admin_headers, employee_headers, fake_llm):
    await upload(client, admin_headers, "Leave Policy", b"## Annual Leave\n\nEmployees get 25 days of annual leave.\n")
    fake_llm.responder = lambda system, msgs: "You get 25 days [1]."
    result = await answer("How many days of annual leave do employees get?")
    c = result.citations[0]
    src = await client.get(f"/api/sources/{c.chunk_id}", headers=employee_headers)
    assert src.status_code == 200 and "25 days" in src.json()["text"] and src.json()["has_file"] is True
    f = await client.get(f"/api/documents/{c.document_id}/file", headers=employee_headers)
    assert f.status_code == 200 and b"25 days" in f.content
    assert (await client.get(f"/api/sources/{c.chunk_id}")).status_code == 401


async def test_follow_up_still_retrieves_for_the_new_question(client, admin_headers, fake_llm):
    from app.schemas import HistoryTurn

    await upload(client, admin_headers, "Leave Policy", b"## Annual Leave\n\nAnnual leave annual leave holiday entitlement 20 days.\n")
    await upload(client, admin_headers, "Handbook", b"## Sickness\n\nSick sick sickness absence 10 days.\n")
    history = [HistoryTurn(role="user", content="annual leave holiday entitlement annual leave")]
    result = await answer("sick sickness absence", history)
    assert "Handbook" in {h.document_title for h in result.retrieved}
