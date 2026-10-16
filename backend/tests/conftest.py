"""Test setup: a dedicated Postgres database (askhr_test) and fake providers.

Tests hit the real pgvector database because retrieval filtering (active/ready)
is part of what we're testing; only the LLM and embeddings are faked.
"""
import os

os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://askhr:askhr@localhost:5432/askhr_test"
)
os.environ.update(
    LLM_PROVIDER="fake",
    EMBEDDING_PROVIDER="fake",
    ADMIN_PASSWORD="test-password",
    JWT_SECRET="test-secret-test-secret-test-secret",
    SIMILARITY_THRESHOLD="0.2",
    HR_CONTACT="hr@test.example",
)

import pytest  # noqa: E402
from alembic.config import Config  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from alembic import command  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.db import init_engine, session_factory  # noqa: E402
from app.providers.factory import get_llm  # noqa: E402

get_settings.cache_clear()


@pytest.fixture(scope="session", autouse=True)
def migrated_db():
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "alembic"))
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield


@pytest.fixture(autouse=True)
async def clean_db(migrated_db):
    init_engine(os.environ["DATABASE_URL"])
    async with session_factory()() as s:
        await s.execute(text("TRUNCATE chunks, documents, people, chat_logs RESTART IDENTITY CASCADE"))
        await s.execute(text("UPDATE company_info SET content = ''"))
        await s.commit()
    llm = get_llm()
    llm.responder = lambda system, msgs: "NO_ANSWER"
    yield


@pytest.fixture
def fake_llm():
    return get_llm()


@pytest.fixture
async def client():
    from app.main import app

    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c


@pytest.fixture
async def admin_headers(client):
    resp = await client.post("/api/admin/login", json={"password": "test-password"})
    return {"Authorization": f"Bearer {resp.json()['token']}"}


async def upload(client, headers, title, content: bytes, filename="doc.md", replace=False, category="policy"):
    """Upload a document; ASGITransport runs background tasks before returning."""
    return await client.post(
        "/api/admin/documents",
        headers=headers,
        files={"file": (filename, content)},
        data={"title": title, "category": category, "replace": str(replace).lower()},
    )
