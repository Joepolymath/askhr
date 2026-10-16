import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Chunk, Document, DocStatus


@dataclass
class Retrieved:
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    document_title: str
    document_updated_at: datetime
    section: str | None
    page: int | None
    text: str
    similarity: float


async def search(session: AsyncSession, query_embedding: list[float], top_k: int) -> list[Retrieved]:
    """Top-k chunks by cosine similarity, from active + ready documents only.

    The caller applies the similarity threshold so it can still report the best
    score for a miss (useful when tuning the threshold).
    """
    # pgvector >= 0.8: keep scanning the HNSW index until enough rows survive
    # the WHERE filter. Without this, inactive versions near the top of the
    # index could silently shrink the result set below top_k.
    await session.execute(text("SET LOCAL hnsw.iterative_scan = strict_order"))

    distance = Chunk.embedding.cosine_distance(query_embedding)
    stmt = (
        select(Chunk, Document.title, Document.uploaded_at, distance.label("distance"))
        .join(Document, Document.id == Chunk.document_id)
        .where(Document.is_active.is_(True), Document.status == DocStatus.ready)
        .order_by(distance)
        .limit(top_k)
    )
    rows = (await session.execute(stmt)).all()
    return [
        Retrieved(
            chunk_id=chunk.id,
            document_id=chunk.document_id,
            document_title=title,
            document_updated_at=uploaded_at,
            section=chunk.section,
            page=chunk.page,
            text=chunk.text,
            similarity=1.0 - float(dist),  # cosine distance -> similarity
        )
        for chunk, title, uploaded_at, dist in rows
    ]
