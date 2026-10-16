from sqlalchemy import func, select

from app.db import session_factory
from app.models import Chunk
from app.providers.factory import get_embedder
from app.rag.retrieval import search
from tests.conftest import upload

V1 = b"# Leave Policy\n\n## Annual Leave\n\nEmployees receive 20 days of annual leave per year.\n"
V2 = b"# Leave Policy\n\n## Annual Leave\n\nEmployees receive 25 days of annual leave per year.\n"


async def _retrieve(question: str):
    async with session_factory()() as s:
        vec = (await get_embedder().embed([question]))[0]
        return await search(s, vec, 6)


async def test_same_title_prompts_then_replaces(client, admin_headers):
    r1 = await upload(client, admin_headers, "Leave Policy", V1)
    assert r1.status_code == 202
    v1 = (await client.get(f"/api/admin/documents/{r1.json()['id']}", headers=admin_headers)).json()
    assert v1["status"] == "ready" and v1["chunk_count"] >= 1

    # Same title (different case/spacing) without replace -> 409 for the UI prompt.
    conflict = await upload(client, admin_headers, "  leave   POLICY ", V2)
    assert conflict.status_code == 409
    assert conflict.json()["existing"]["id"] == v1["id"]

    r2 = await upload(client, admin_headers, "Leave Policy", V2, replace=True)
    assert r2.status_code == 202
    docs = {d["id"]: d for d in (await client.get("/api/admin/documents", headers=admin_headers)).json()}
    assert docs[v1["id"]]["is_active"] is False
    assert docs[r2.json()["id"]]["is_active"] is True
    assert docs[r2.json()["id"]]["supersedes_id"] == v1["id"]

    # Only the new version is retrievable.
    hits = await _retrieve("how many days of annual leave")
    assert hits and all("25 days" in h.text for h in hits)


async def test_inactive_documents_not_retrieved(client, admin_headers):
    r = await upload(client, admin_headers, "Leave Policy", V1)
    doc_id = r.json()["id"]
    assert await _retrieve("annual leave days")

    resp = await client.patch(f"/api/admin/documents/{doc_id}", headers=admin_headers, json={"is_active": False})
    assert resp.status_code == 200
    assert await _retrieve("annual leave days") == []


async def test_failed_replacement_keeps_old_version_live(client, admin_headers):
    r1 = await upload(client, admin_headers, "Leave Policy", V1)
    blank_pdf = b"%PDF-1.4\n%%EOF"  # passes the magic-byte check, fails parsing
    r2 = await upload(client, admin_headers, "Leave Policy", blank_pdf, filename="v2.pdf", replace=True)
    assert r2.status_code == 202
    new = (await client.get(f"/api/admin/documents/{r2.json()['id']}", headers=admin_headers)).json()
    old = (await client.get(f"/api/admin/documents/{r1.json()['id']}", headers=admin_headers)).json()
    assert new["status"] == "failed" and new["error_message"]
    assert old["is_active"] is True
    hits = await _retrieve("annual leave days")
    assert hits and all(str(h.document_id) == r1.json()["id"] for h in hits)


async def test_reactivating_old_version_conflicts(client, admin_headers):
    r1 = await upload(client, admin_headers, "Leave Policy", V1)
    await upload(client, admin_headers, "Leave Policy", V2, replace=True)
    resp = await client.patch(f"/api/admin/documents/{r1.json()['id']}", headers=admin_headers, json={"is_active": True})
    assert resp.status_code == 409


async def test_delete_cascades_to_chunks(client, admin_headers):
    r = await upload(client, admin_headers, "Leave Policy", V1)
    resp = await client.delete(f"/api/admin/documents/{r.json()['id']}", headers=admin_headers)
    assert resp.status_code == 204
    async with session_factory()() as s:
        assert (await s.execute(select(func.count()).select_from(Chunk))).scalar() == 0


async def test_upload_validation(client, admin_headers):
    bad = await upload(client, admin_headers, "Fake", b"not a pdf", filename="x.pdf")
    assert bad.status_code == 415
    from app.config import get_settings

    big = b"a" * (get_settings().max_upload_bytes + 1)
    too_big = await upload(client, admin_headers, "Big", big, filename="big.txt")
    assert too_big.status_code == 413


async def test_failed_upload_does_not_block_reupload(client, admin_headers):
    failed = await upload(client, admin_headers, "Leave Policy", b"%PDF-1.4\n%%EOF", filename="v1.pdf")
    assert (await client.get(f"/api/admin/documents/{failed.json()['id']}", headers=admin_headers)).json()["status"] == "failed"
    # Same title again: no "replace?" prompt, because nothing searchable exists yet.
    r = await upload(client, admin_headers, "Leave Policy", V1)
    assert r.status_code == 202
