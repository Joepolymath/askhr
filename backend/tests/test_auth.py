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


async def test_chat_is_public(client):
    resp = await client.post("/api/chat", json={"question": "hello"})
    assert resp.status_code == 200
