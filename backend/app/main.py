import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text, update

from app.config import PRODUCT_NAME, get_settings
from app.db import session_factory
from app.models import EMBEDDING_DIM, Document, DocStatus
from app.routers import admin_auth, chat, company, documents, insights, people

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    if settings.embedding_dimensions != EMBEDDING_DIM:
        raise RuntimeError(
            f"EMBEDDING_DIMENSIONS={settings.embedding_dimensions} but the chunks.embedding "
            f"column is vector({EMBEDDING_DIM}). Add a migration before changing embedding models."
        )
    # Background ingestion tasks die with the process. Anything still marked
    # `processing` at startup was interrupted, so surface it instead of leaving
    # it spinning forever in the UI.
    async with session_factory()() as session:
        result = await session.execute(
            update(Document)
            .where(Document.status == DocStatus.processing)
            .values(status=DocStatus.failed, error_message="Processing was interrupted — please re-upload.")
        )
        await session.commit()
        if result.rowcount:
            log.warning("Marked %d interrupted document(s) as failed", result.rowcount)
    yield


app = FastAPI(title=f"{PRODUCT_NAME} API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(admin_auth.router)
app.include_router(documents.router)
app.include_router(people.router)
app.include_router(company.router)
app.include_router(insights.router)
app.include_router(chat.router)


@app.get("/api/health")
async def health() -> dict:
    async with session_factory()() as session:
        await session.execute(text("SELECT 1"))
    return {"status": "ok"}
