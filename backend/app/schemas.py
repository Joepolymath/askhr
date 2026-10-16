import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models import DocCategory, DocStatus


class LoginIn(BaseModel):
    password: str


class LoginOut(BaseModel):
    token: str
    expires_at: datetime


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    original_filename: str
    category: DocCategory
    status: DocStatus
    is_active: bool
    error_message: str | None
    chunk_count: int
    size_bytes: int
    supersedes_id: uuid.UUID | None
    uploaded_at: datetime
    processed_at: datetime | None


class DocumentPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    category: DocCategory | None = None
    is_active: bool | None = None


class PersonIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    role: str = Field(min_length=1, max_length=200)
    department: str | None = Field(default=None, max_length=200)
    email: str | None = Field(default=None, max_length=320)
    bio: str | None = Field(default=None, max_length=2000)


class PersonOut(PersonIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID


class CompanyInfoIO(BaseModel):
    content: str = Field(max_length=20000)


class HistoryTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=8000)


class ChatIn(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    history: list[HistoryTurn] = Field(default_factory=list, max_length=50)
    employee_name: str | None = Field(default=None, max_length=200)


class Citation(BaseModel):
    index: int
    document_id: uuid.UUID
    document_title: str
    section: str | None
    page: int | None
    snippet: str
    similarity: float


class FeedbackIn(BaseModel):
    rating: Literal[1, -1]


class ChatLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    employee_name: str | None
    question: str
    answer: str
    citations: list
    unanswered: bool
    top_similarity: float | None
    rating: int | None
    created_at: datetime


class InsightsOut(BaseModel):
    total_questions: int
    unanswered_count: int
    thumbs_up: int
    thumbs_down: int
    recent: list[ChatLogOut]
    unanswered: list[ChatLogOut]
    rated: list[ChatLogOut]
