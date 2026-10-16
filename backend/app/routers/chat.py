import json
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_employee
from app.db import get_session, session_factory
from app.models import ChatLog, Chunk, Document, DocumentFile
from app.rag.chat import answer_events
from app.schemas import ChatIn, FeedbackIn, SourceOut

router = APIRouter(prefix="/api", tags=["chat"], dependencies=[Depends(require_employee)])


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/chat")
async def chat(body: ChatIn) -> StreamingResponse:
    """Stream the answer as Server-Sent Events: meta, status*, token*, done (or error)."""

    async def stream():
        async for event in answer_events(body.question, body.history):
            yield _sse(event["event"], event["data"])

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        # Disable proxy buffering so tokens reach the browser as they're generated.
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/chat/{chat_id}/feedback", status_code=status.HTTP_204_NO_CONTENT)
async def feedback(chat_id: uuid.UUID, body: FeedbackIn) -> None:
    async with session_factory()() as session:
        row = await session.get(ChatLog, chat_id)
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown answer")
        row.rating = body.rating
        row.rated_at = datetime.now(UTC)
        await session.commit()


def _new_paragraphs(text: str, seen: str) -> list[str]:
    # Chunks overlap, so drop neighbour paragraphs already shown in the passage.
    return [p for p in text.split("\n\n") if p.strip() and p.strip() not in seen]


@router.get("/sources/{chunk_id}", response_model=SourceOut)
async def source(chunk_id: uuid.UUID, session: AsyncSession = Depends(get_session)) -> SourceOut:
    """A cited passage plus a paragraph of context either side, for the source panel."""
    chunk = await session.get(Chunk, chunk_id)
    doc = await session.get(Document, chunk.document_id) if chunk else None
    if chunk is None or doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This source is no longer available")
    neighbours = {
        c.chunk_index: c
        for c in (
            await session.execute(
                select(Chunk).where(
                    Chunk.document_id == doc.id,
                    Chunk.chunk_index.in_([chunk.chunk_index - 1, chunk.chunk_index + 1]),
                )
            )
        ).scalars()
    }
    prev, nxt = neighbours.get(chunk.chunk_index - 1), neighbours.get(chunk.chunk_index + 1)
    before = _new_paragraphs(prev.text, chunk.text)[-1:] if prev else []
    after = _new_paragraphs(nxt.text, chunk.text)[:1] if nxt else []
    has_file = (await session.execute(select(DocumentFile.document_id).where(DocumentFile.document_id == doc.id))).first()
    return SourceOut(
        document_id=doc.id,
        document_title=doc.title,
        mime_type=doc.mime_type,
        updated_at=doc.uploaded_at,
        section=chunk.section,
        page=chunk.page,
        page_count=doc.page_count,
        before=before[0] if before else None,
        text=chunk.text,
        after=after[0] if after else None,
        has_file=has_file is not None,
    )


@router.get("/documents/{doc_id}/file")
async def document_file(doc_id: uuid.UUID, session: AsyncSession = Depends(get_session)) -> Response:
    """The original upload. Only active documents: employees shouldn't open
    retired versions from old citations."""
    doc = await session.get(Document, doc_id)
    stored = await session.get(DocumentFile, doc_id)
    if doc is None or stored is None or not doc.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This document is no longer available")
    safe_name = doc.original_filename.replace('"', "")
    return Response(
        stored.data,
        media_type=doc.mime_type,
        headers={"Content-Disposition": f'inline; filename="{safe_name}"'},
    )
