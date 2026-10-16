from app.rag.chat import answer
from tests.conftest import upload


async def test_gaps_grouped_and_dismissable(client, admin_headers, fake_llm):
    for q in ["Do we get a gym allowance?", "do we get a gym allowance", "What is the Wi-Fi password?"]:
        await answer(q)
    data = (await client.get("/api/admin/insights", headers=admin_headers)).json()
    assert data["total_questions"] == 3 and data["not_found_count"] == 3
    assert [(g["count"], g["key"]) for g in data["gaps"]][0] == (2, "do we get a gym allowance")

    resp = await client.post("/api/admin/insights/gaps/dismiss", headers=admin_headers, json={"key": "do we get a gym allowance"})
    assert resp.status_code == 204
    data = (await client.get("/api/admin/insights", headers=admin_headers)).json()
    assert [g["count"] for g in data["gaps"]] == [1]
    assert all("employee_name" not in r for r in data["recent"])


async def test_conflicts_and_results(client, admin_headers, fake_llm):
    await upload(client, admin_headers, "Leave Policy", b"## Sick Leave\n\nEmployees get 12 days of sick leave.\n")
    await upload(client, admin_headers, "Handbook", b"## Sick Leave\n\nStaff get 10 days of sick leave.\n")
    fake_llm.responder = lambda s, m: "CONFLICT:\nPolicy says 12 [1]; Handbook says 10 [2]."
    await answer("How many days of sick leave do employees get?")
    data = (await client.get("/api/admin/insights?period=this_week", headers=admin_headers)).json()
    assert data["recent"][0]["result"] == "conflict"
    assert data["conflicts"][0]["documents"] == ["Handbook", "Leave Policy"]
    last_week = (await client.get("/api/admin/insights?period=last_week", headers=admin_headers)).json()
    assert last_week["total_questions"] == 0 and last_week["previous_total"] == 0
