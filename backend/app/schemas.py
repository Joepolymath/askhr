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


class EmployeeLoginIn(BaseModel):
    email: str = Field(min_length=1, max_length=320)
    employee_id: str = Field(min_length=1, max_length=50)
    remember: bool = False


class EmployeeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    role: str
    department: str | None
    email: str | None


class EmployeeLoginOut(BaseModel):
    token: str
    expires_at: datetime
    employee: EmployeeOut


class PublicInfo(BaseModel):
    """What the sign-in page and chat need to know about the company."""

    company_name: str
    hr_contact_name: str
    hr_contact_role: str | None
    hr_contact_email: str
    document_count: int


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
    page_count: int | None
    supersedes_id: uuid.UUID | None
    uploaded_at: datetime
    processed_at: datetime | None
    # Filled in by the list endpoint from the supersedes chain.
    version: int = 1
    replaced_by_title: str | None = None


class DocumentPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    category: DocCategory | None = None
    is_active: bool | None = None


class PersonIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    role: str = Field(min_length=1, max_length=200)
    department: str | None = Field(default=None, max_length=200)
    email: str | None = Field(default=None, max_length=320)
    employee_id: str | None = Field(default=None, max_length=50)
    has_access: bool = True
    bio: str | None = Field(default=None, max_length=2000)


ImportResult = Literal["new", "update", "unchanged", "error"]


class ImportRow(BaseModel):
    row: int  # spreadsheet row number (header is row 1)
    name: str
    role: str
    email: str
    employee_id: str
    department: str | None
    result: ImportResult
    message: str | None = None  # error reason, or "Update: role, department"


class ImportMissing(BaseModel):
    id: uuid.UUID
    name: str
    employee_id: str | None


class ImportPreview(BaseModel):
    filename: str
    total_rows: int
    columns_matched: int
    rows: list[ImportRow]
    new_count: int
    update_count: int
    unchanged_count: int
    error_count: int
    # People who can sign in today but aren't in the file.
    missing: list[ImportMissing]
    committed: bool = False


class PersonOut(PersonIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID


class CompanyInfoIn(BaseModel):
    name: str = Field(default="", max_length=200)
    content: str = Field(default="", max_length=20000)  # what the company does
    mission: str = Field(default="", max_length=5000)
    hr_contact_name: str = Field(default="", max_length=200)
    hr_contact_email: str = Field(default="", max_length=320)


class CompanyInfoOut(CompanyInfoIn):
    updated_at: datetime | None


class HistoryTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=8000)


class ChatIn(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    history: list[HistoryTurn] = Field(default_factory=list, max_length=50)


class Citation(BaseModel):
    index: int
    document_id: uuid.UUID
    document_title: str
    section: str | None
    page: int | None
    snippet: str
    similarity: float
    chunk_id: uuid.UUID | None = None  # None in logs written before it existed
    document_updated_at: datetime | None = None


class SourceOut(BaseModel):
    """A cited passage with its neighbours, for the source panel."""

    document_id: uuid.UUID
    document_title: str
    mime_type: str
    updated_at: datetime
    section: str | None
    page: int | None
    page_count: int | None
    before: str | None
    text: str
    after: str | None
    has_file: bool


class FeedbackIn(BaseModel):
    rating: Literal[1, -1]


InsightsPeriod = Literal["this_week", "last_week", "last_30_days"]


class RecentQuestion(BaseModel):
    """No employee name: Insights never shows who asked."""

    id: uuid.UUID
    question: str
    answer: str
    citations: list
    result: Literal["answered", "not_found", "conflict"]
    rating: int | None
    created_at: datetime


class Gap(BaseModel):
    key: str  # normalised question text; used to dismiss
    question: str
    count: int
    last_asked: datetime
    closest_document_title: str | None


class ConflictGroup(BaseModel):
    documents: list[str]
    count: int
    last_question: str
    last_asked: datetime


class InsightsOut(BaseModel):
    period: InsightsPeriod
    start: datetime
    end: datetime
    total_questions: int
    previous_total: int
    answered_count: int
    not_found_count: int
    rated_count: int
    thumbs_up: int
    gaps: list[Gap]
    conflicts: list[ConflictGroup]
    recent: list[RecentQuestion]


class DismissGapIn(BaseModel):
    key: str = Field(min_length=1, max_length=2000)
