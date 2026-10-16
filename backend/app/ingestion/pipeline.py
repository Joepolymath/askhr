"""Background ingestion: parse -> chunk -> embed -> store.

Runs after the upload request has returned. Parsing and chunking are
synchronous and CPU-bound, so they go to a worker thread; embedding is network
I/O on the async client. The event loop stays free to serve chat requests
while a large document is processed.
"""
import asyncio
import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy import select, update

from app.db import session_factory
from app.ingestion.chunking import chunk_sections
from app.ingestion.parse import ParseError, parse
from app.models import Chunk, Document, DocStatus
from app.providers.factory import get_embedder

log = logging.getLogger(__name__)


async def ingest(doc_id: uuid.UUID, data: bytes) -> None:
    async with session_factory()() as session:
        doc = await session.get(Document, doc_id)
        if doc is None:  # deleted before processing started
            return
        title, mime = doc.title, doc.mime_type

    try:
        sections = await asyncio.to_thread(parse, data, mime)
        chunks = await asyncio.to_thread(chunk_sections, sections)
        if not chunks:
            raise ParseError("No text found in this document.")
        embeddings = await get_embedder().embed([c.embed_text(title) for c in chunks])
    except ParseError as exc:
        await _mark_failed(doc_id, str(exc))
        return
    except Exception as exc:
        log.exception("Ingestion failed for %s", doc_id)
        await _mark_failed(doc_id, f"Processing failed: {type(exc).__name__}: {exc}"[:500])
        return

    async with session_factory()() as session:
        doc = await session.get(Document, doc_id)
        if doc is None:
            return
        session.add_all(
            Chunk(
                document_id=doc_id,
                chunk_index=c.index,
                text=c.text,
                section=c.section,
                page=c.page,
                token_count=c.token_count,
                embedding=emb,
            )
            for c, emb in zip(chunks, embeddings, strict=True)
        )
        doc.status = DocStatus.ready
        doc.chunk_count = len(chunks)
        doc.page_count = max((s.page for s in sections if s.page), default=None)
        doc.processed_at = datetime.now(UTC)
        doc.error_message = None

        if doc.supersedes_id is not None and doc.is_active:
            # Versioning: the old version is retired only now that the new one
            # is searchable, so a failed replacement never leaves a gap.
            await session.execute(
                update(Document)
                .where(
                    Document.title_norm == doc.title_norm,
                    Document.id != doc.id,
                    Document.is_active.is_(True),
                )
                .values(is_active=False)
            )
        await session.commit()
    log.info("Ingested %s: %d chunks", doc_id, len(chunks))


async def _mark_failed(doc_id: uuid.UUID, message: str) -> None:
    async with session_factory()() as session:
        await session.execute(
            update(Document)
            .where(Document.id == doc_id)
            .values(status=DocStatus.failed, error_message=message, processed_at=datetime.now(UTC))
        )
        await session.commit()


async def find_active_by_title(session, title_norm: str, exclude: uuid.UUID | None = None) -> Document | None:
    """The live (or about-to-be-live) version for a title. Failed uploads never
    count: they hold no searchable content, so they shouldn't block a re-upload."""
    q = select(Document).where(
        Document.title_norm == title_norm,
        Document.is_active.is_(True),
        Document.status != DocStatus.failed,
    )
    if exclude is not None:
        q = q.where(Document.id != exclude)
    return (await session.execute(q.order_by(Document.uploaded_at.desc()))).scalars().first()
