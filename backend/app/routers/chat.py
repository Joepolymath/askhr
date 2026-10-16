import json
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from app.auth.employee import employee_name
from app.db import session_factory
from app.models import ChatLog
from app.rag.chat import answer_events
from app.schemas import ChatIn, FeedbackIn

router = APIRouter(prefix="/api/chat", tags=["chat"])


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("")
async def chat(body: ChatIn) -> StreamingResponse:
    """Stream the answer as Server-Sent Events: meta, token*, done (or error)."""

    async def stream():
        async for event in answer_events(body.question, body.history, employee_name(body.employee_name)):
            yield _sse(event["event"], event["data"])

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        # Disable proxy buffering so tokens reach the browser as they're generated.
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/{chat_id}/feedback", status_code=status.HTTP_204_NO_CONTENT)
async def feedback(chat_id: uuid.UUID, body: FeedbackIn) -> None:
    async with session_factory()() as session:
        row = await session.get(ChatLog, chat_id)
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown answer")
        row.rating = body.rating
        row.rated_at = datetime.now(UTC)
        await session.commit()
