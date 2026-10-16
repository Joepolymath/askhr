from tests.conftest import EMPLOYEE

CSV = (
    "name,role,email,employee_id,department\n"
    "Chiamaka Obi,Senior Claims Associate,chiamaka.obi@test.example,NWL-0126,Claims\n"
    "Yusuf Danjuma,Underwriter,yusuf.danjuma@test.example,nwl-0131,Underwriting\n"
    "Bola Adebayo,Sales Agent,,NWL-0117,Sales\n"
    "Emeka Uche,Analyst,emeka.uche@test.example,NWL-0131,Finance\n"
)


async def _import(client, headers, body: str, **form):
    return await client.post(
        "/api/admin/people/import",
        headers=headers,
        files={"file": ("staff.csv", body.encode())},
        data={k: str(v).lower() for k, v in form.items()},
    )


async def test_preview_classifies_rows_without_writing(client, admin_headers, employee_headers):
    resp = await _import(client, admin_headers, CSV)
    assert resp.status_code == 200
    p = resp.json()
    by_row = {r["row"]: r for r in p["rows"]}
    assert by_row[2]["result"] == "update" and "role" in by_row[2]["message"]
    assert by_row[3]["result"] == "new" and by_row[3]["employee_id"] == "NWL-0131"
    assert by_row[4]["message"] == "Email is required"
    assert by_row[5]["message"] == "ID also on row 3"
    assert (p["new_count"], p["update_count"], p["error_count"]) == (1, 1, 2)
    assert p["committed"] is False
    assert len((await client.get("/api/admin/people", headers=admin_headers)).json()) == 1


async def test_commit_applies_and_is_idempotent(client, admin_headers, employee_headers):
    assert (await _import(client, admin_headers, CSV, commit=True)).json()["committed"] is True
    people = {p["employee_id"]: p for p in (await client.get("/api/admin/people", headers=admin_headers)).json()}
    assert set(people) == {"NWL-0126", "NWL-0131"}
    assert people["NWL-0126"]["role"] == "Senior Claims Associate"
    again = (await _import(client, admin_headers, CSV)).json()
    assert again["new_count"] == 0 and again["update_count"] == 0 and again["unchanged_count"] == 2


async def test_remove_missing_revokes_access(client, admin_headers, employee_headers):
    only_new = "name,role,email,employee_id\nYusuf Danjuma,Underwriter,yusuf@test.example,NWL-0131\n"
    preview = (await _import(client, admin_headers, only_new)).json()
    assert [m["employee_id"] for m in preview["missing"]] == [EMPLOYEE["employee_id"]]
    await _import(client, admin_headers, only_new, commit=True, remove_missing=True)
    assert (await client.get("/api/auth/me", headers=employee_headers)).status_code == 401


async def test_missing_columns_rejected(client, admin_headers):
    resp = await _import(client, admin_headers, "name,email\nA,a@test.example\n")
    assert resp.status_code == 422 and "role" in resp.json()["detail"]


async def test_duplicate_employee_id_rejected(client, admin_headers, employee_headers):
    resp = await client.post(
        "/api/admin/people", headers=admin_headers, json={**EMPLOYEE, "email": "other@test.example"}
    )
    assert resp.status_code == 409 and "NWL-0126" in resp.json()["detail"]
