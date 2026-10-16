from datetime import UTC, datetime, timedelta

import jwt
import pytest

ADMIN_ROUTES = [
    ("get", "/api/admin/documents"),
    ("get", "/api/admin/people"),
    ("get", "/api/admin/company"),
    ("get", "/api/admin/insights"),
    ("delete", "/api/admin/documents/00000000-0000-0000-0000-000000000000"),
]


async def test_wrong_password_rejected(client):
    resp = await client.post("/api/admin/login", json={"password": "nope"})
    assert resp.status_code == 401


@pytest.mark.parametrize("method,path", ADMIN_ROUTES)
async def test_admin_routes_require_token(client, method, path):
    resp = await getattr(client, method)(path)
    assert resp.status_code == 401


async def test_tampered_token_rejected(client, admin_headers):
    token = admin_headers["Authorization"].split()[1]
    bad = token[:-2] + ("AA" if token[-2:] != "AA" else "BB")
    resp = await client.get("/api/admin/documents", headers={"Authorization": f"Bearer {bad}"})
    assert resp.status_code == 401


async def test_token_signed_with_other_secret_rejected(client):
    forged = jwt.encode({"role": "admin", "exp": datetime.now(UTC) + timedelta(hours=1)}, "x" * 32, "HS256")
    resp = await client.get("/api/admin/documents", headers={"Authorization": f"Bearer {forged}"})
    assert resp.status_code == 401


async def test_expired_token_rejected(client):
    expired = jwt.encode(
        {"role": "admin", "exp": datetime.now(UTC) - timedelta(minutes=1)},
        "test-secret-test-secret-test-secret",
        "HS256",
    )
    resp = await client.get("/api/admin/documents", headers={"Authorization": f"Bearer {expired}"})
    assert resp.status_code == 401


async def test_valid_token_accepted(client, admin_headers):
    resp = await client.get("/api/admin/documents", headers=admin_headers)
    assert resp.status_code == 200


async def test_chat_requires_employee(client, admin_headers):
    assert (await client.post("/api/chat", json={"question": "hello"})).status_code == 401
    # An admin token is not an employee sign-in.
    assert (await client.post("/api/chat", headers=admin_headers, json={"question": "hello"})).status_code == 401


async def test_employee_login(client, employee_headers):
    me = await client.get("/api/auth/me", headers=employee_headers)
    assert me.status_code == 200 and me.json()["name"] == "Chiamaka Obi"
    assert (await client.post("/api/chat", headers=employee_headers, json={"question": "hello"})).status_code == 200


async def test_employee_login_is_case_insensitive(client, admin_headers, employee_headers):
    resp = await client.post("/api/auth/login", json={"email": " Chiamaka.Obi@TEST.example", "employee_id": "nwl-0126 "})
    assert resp.status_code == 200


@pytest.mark.parametrize(
    "email,eid",
    [("chiamaka.obi@test.example", "NWL-9999"), ("nobody@test.example", "NWL-0126")],
)
async def test_employee_login_mismatch(client, employee_headers, email, eid):
    resp = await client.post("/api/auth/login", json={"email": email, "employee_id": eid})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "That email and employee ID don't match"


async def test_removing_access_or_changing_id_signs_out(client, admin_headers, employee_headers):
    person = (await client.get("/api/admin/people", headers=admin_headers)).json()[0]
    await client.put(f"/api/admin/people/{person['id']}", headers=admin_headers, json={**person, "employee_id": "NWL-0200"})
    assert (await client.get("/api/auth/me", headers=employee_headers)).status_code == 401

    resp = await client.post("/api/auth/login", json={"email": person["email"], "employee_id": "NWL-0200"})
    headers = {"Authorization": f"Bearer {resp.json()['token']}"}
    await client.put(
        f"/api/admin/people/{person['id']}",
        headers=admin_headers,
        json={**person, "employee_id": "NWL-0200", "has_access": False},
    )
    assert (await client.get("/api/auth/me", headers=headers)).status_code == 401
    assert (await client.post("/api/auth/login", json={"email": person["email"], "employee_id": "NWL-0200"})).status_code == 401
