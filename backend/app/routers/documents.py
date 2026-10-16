import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_admin
from app.config import get_settings
from app.db import get_session
from app.ingestion.pipeline import find_active_by_title, ingest
from app.ingestion.validate import FileRejected, detect_type
from app.models import DocCategory, Document, DocumentFile, DocStatus, normalize_title
from app.schemas import DocumentOut, DocumentPatch

router = APIRouter(prefix="/api/admin/documents", tags=["documents"], dependencies=[Depends(require_admin)])

READ_CHUNK = 1024 * 1024


async def _read_limited(file: UploadFile, limit: int) -> bytes:
    """Read the upload, rejecting it as soon as it exceeds the size limit."""
    buf = bytearray()
    while chunk := await file.read(READ_CHUNK):
        buf.extend(chunk)
        if len(buf) > limit:
            raise HTTPException(
                status.HTTP_413_CONTENT_TOO_LARGE,
                f"File is larger than {limit // (1024 * 1024)} MB.",
            )
    return bytes(buf)


def with_versions(docs: list[Document]) -> list[DocumentOut]:
    """Version number (length of the supersedes chain) and, for retired
    versions, the title of the upload that replaced them."""
    by_id = {d.id: d for d in docs}
    replaced_by = {d.supersedes_id: d for d in sorted(docs, key=lambda d: d.uploaded_at) if d.supersedes_id}

    def version(d: Document) -> int:
        n, seen = 1, {d.id}
        while d.supersedes_id in by_id and d.supersedes_id not in seen:
            d = by_id[d.supersedes_id]
            seen.add(d.id)
            n += 1
        return n

    out = []
    for d in docs:
        successor = replaced_by.get(d.id)
        out.append(
            DocumentOut.model_validate(d).model_copy(
                update={
                    "version": version(d),
                    "replaced_by_title": successor.title if successor and not d.is_active else None,
                }
            )
        )
    return out


@router.get("", response_model=list[DocumentOut])
async def list_documents(session: AsyncSession = Depends(get_session)) -> list[DocumentOut]:
    result = await session.execute(select(Document).order_by(Document.uploaded_at.desc()))
    return with_versions(list(result.scalars()))


@router.get("/{doc_id}", response_model=DocumentOut)
async def get_document(doc_id: uuid.UUID, session: AsyncSession = Depends(get_session)) -> DocumentOut:
    doc = await session.get(Document, doc_id)
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    all_docs = list((await session.execute(select(Document).where(Document.title_norm == doc.title_norm))).scalars())
    return next(d for d in with_versions(all_docs) if d.id == doc.id)


@router.post("", response_model=DocumentOut, status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(..., min_length=1, max_length=300),
    category: DocCategory = Form(DocCategory.other),
    replace: bool = Form(False),
    session: AsyncSession = Depends(get_session),
):
    """Accept a file and return immediately with status `processing`.

    Versioning: if an active document already has this title and `replace` is
    false, respond 409 so the UI can ask "Replace the existing version?". On
    confirm the client re-sends with replace=true.
    """
    data = await _read_limited(file, get_settings().max_upload_bytes)
    filename = file.filename or "upload"
    try:
        mime = detect_type(data, filename)
    except FileRejected as exc:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, str(exc)) from exc

    title = " ".join(title.split())
    title_norm = normalize_title(title)
    existing = await find_active_by_title(session, title_norm)
    if existing is not None and not replace:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "detail": f"An active document titled '{existing.title}' already exists.",
                "existing": DocumentOut.model_validate(existing).model_dump(mode="json"),
            },
        )

    doc = Document(
        title=title,
        title_norm=title_norm,
        original_filename=filename,
        mime_type=mime,
        size_bytes=len(data),
        category=category,
        status=DocStatus.processing,
        is_active=True,
        supersedes_id=existing.id if existing is not None else None,
    )
    session.add(doc)
    await session.flush()
    session.add(DocumentFile(document_id=doc.id, data=data))
    await session.commit()
    await session.refresh(doc)

    background.add_task(ingest, doc.id, data)
    return doc


@router.patch("/{doc_id}", response_model=DocumentOut)
async def update_document(
    doc_id: uuid.UUID, body: DocumentPatch, session: AsyncSession = Depends(get_session)
) -> Document:
    doc = await session.get(Document, doc_id)
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")

    if body.title is not None:
        doc.title = " ".join(body.title.split())
        doc.title_norm = normalize_title(doc.title)
    if body.category is not None:
        doc.category = body.category
    if body.is_active is not None:
        doc.is_active = body.is_active

    # Only one active version per title, so retrieval never mixes versions.
    if doc.is_active:
        clash = await find_active_by_title(session, doc.title_norm, exclude=doc.id)
        if clash is not None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Another version of '{clash.title}' is active. Deactivate it first.",
            )
    await session.commit()
    await session.refresh(doc)
    return doc


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(doc_id: uuid.UUID, session: AsyncSession = Depends(get_session)) -> None:
    doc = await session.get(Document, doc_id)
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    await session.delete(doc)  # chunks go with it (ON DELETE CASCADE)
    await session.commit()
