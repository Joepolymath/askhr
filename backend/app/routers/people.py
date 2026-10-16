import csv
import io
import re
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_admin
from app.auth.employee import normalize_email, normalize_employee_id
from app.db import get_session
from app.models import Person
from app.schemas import ImportMissing, ImportPreview, ImportRow, PersonIn, PersonOut

router = APIRouter(prefix="/api/admin/people", tags=["people"], dependencies=[Depends(require_admin)])

MAX_CSV_BYTES = 2 * 1024 * 1024
REQUIRED_COLUMNS = ("name", "role", "email", "employee_id")
OPTIONAL_COLUMNS = ("department",)
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# CSV header spellings people actually use -> our column names.
_HEADER_ALIASES = {
    "full name": "name", "full_name": "name", "employee name": "name",
    "title": "role", "job title": "role", "position": "role",
    "work email": "email", "email address": "email",
    "employee id": "employee_id", "employeeid": "employee_id", "staff id": "employee_id", "id": "employee_id",
    "dept": "department",
}


def _clean(body: PersonIn) -> dict:
    # Empty optional strings from the form are stored as NULL.
    data = {k: (v.strip() or None) if isinstance(v, str) else v for k, v in body.model_dump().items()}
    if data["email"]:
        data["email"] = normalize_email(data["email"])
    if data["employee_id"]:
        data["employee_id"] = normalize_employee_id(data["employee_id"])
    return data


async def _check_unique(session: AsyncSession, data: dict, exclude: uuid.UUID | None = None) -> None:
    """Email and employee ID together are a sign-in, so each must be unique."""
    checks = [
        ("employee_id", Person.employee_id == data["employee_id"], "Employee ID"),
        ("email", func.lower(Person.email) == data["email"], "Email"),
    ]
    for key, clause, label in checks:
        if not data[key]:
            continue
        q = select(Person).where(clause)
        if exclude is not None:
            q = q.where(Person.id != exclude)
        clash = (await session.execute(q)).scalars().first()
        if clash is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, f"{label} {data[key]} is already used by {clash.name}.")


@router.get("", response_model=list[PersonOut])
async def list_people(session: AsyncSession = Depends(get_session)) -> list[Person]:
    return list((await session.execute(select(Person).order_by(Person.name))).scalars())


@router.post("", response_model=PersonOut, status_code=status.HTTP_201_CREATED)
async def create_person(body: PersonIn, session: AsyncSession = Depends(get_session)) -> Person:
    data = _clean(body)
    await _check_unique(session, data)
    person = Person(**data)
    session.add(person)
    await session.commit()
    await session.refresh(person)
    return person


@router.put("/{person_id}", response_model=PersonOut)
async def update_person(
    person_id: uuid.UUID, body: PersonIn, session: AsyncSession = Depends(get_session)
) -> Person:
    person = await session.get(Person, person_id)
    if person is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Person not found")
    data = _clean(body)
    await _check_unique(session, data, exclude=person.id)
    for key, value in data.items():
        setattr(person, key, value)
    await session.commit()
    await session.refresh(person)
    return person


@router.delete("/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_person(person_id: uuid.UUID, session: AsyncSession = Depends(get_session)) -> None:
    person = await session.get(Person, person_id)
    if person is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Person not found")
    await session.delete(person)
    await session.commit()


# ---------------------------------------------------------------- CSV import


def _read_csv(data: bytes) -> tuple[list[str], list[dict[str, str]]]:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = data.decode("latin-1")
    reader = csv.reader(io.StringIO(text))
    rows = [r for r in reader]
    if not rows:
        raise HTTPException(422, "The file is empty.")
    header = []
    for raw in rows[0]:
        key = " ".join(raw.strip().lower().split())
        header.append(_HEADER_ALIASES.get(key, key.replace(" ", "_")))
    missing = [c for c in REQUIRED_COLUMNS if c not in header]
    if missing:
        raise HTTPException(
            422,
            f"Missing column{'s' if len(missing) > 1 else ''}: {', '.join(missing)}. "
            f"Expected columns: {', '.join(REQUIRED_COLUMNS)}.",
        )
    records = []
    for values in rows[1:]:
        if not any(v.strip() for v in values):
            continue  # blank line
        records.append({h: (values[i].strip() if i < len(values) else "") for i, h in enumerate(header)})
    return header, records


_FIELD_LABELS = {"name": "name", "role": "role", "email": "email", "department": "department", "has_access": "access restored"}


async def _plan(
    session: AsyncSession, data: bytes, filename: str
) -> tuple[ImportPreview, list[tuple[ImportRow, Person | None]], bool]:
    """Classify every row; also returns whether the file has a department column."""
    header, records = _read_csv(data)
    people = list((await session.execute(select(Person))).scalars())
    by_eid = {p.employee_id: p for p in people if p.employee_id}
    by_email = {p.email.lower(): p for p in people if p.email}

    # First pass: where each ID/email appears in the file, to flag duplicates.
    first_row_for_eid: dict[str, int] = {}
    first_row_for_email: dict[str, int] = {}
    for n, rec in enumerate(records, start=2):
        eid = normalize_employee_id(rec.get("employee_id", ""))
        email = normalize_email(rec.get("email", ""))
        if eid:
            first_row_for_eid.setdefault(eid, n)
        if email:
            first_row_for_email.setdefault(email, n)

    planned: list[tuple[ImportRow, Person | None]] = []
    for n, rec in enumerate(records, start=2):
        name = " ".join(rec.get("name", "").split())
        role = " ".join(rec.get("role", "").split())
        email = normalize_email(rec.get("email", ""))
        eid = normalize_employee_id(rec.get("employee_id", ""))
        department = " ".join(rec.get("department", "").split()) or None
        existing = by_eid.get(eid)

        error = None
        for label, value in (("Name", name), ("Role", role), ("Email", email), ("Employee ID", eid)):
            if not value:
                error = f"{label} is required"
                break
        if error is None and not _EMAIL.match(email):
            error = "Email doesn't look right"
        elif error is None and first_row_for_eid[eid] != n:
            error = f"ID also on row {first_row_for_eid[eid]}"
        elif error is None and first_row_for_email[email] != n:
            error = f"Email also on row {first_row_for_email[email]}"
        elif error is None and email in by_email and by_email[email] is not existing:
            error = f"Email already belongs to {by_email[email].name}"
        elif error is None and (len(name) > 200 or len(role) > 200 or len(email) > 320 or len(eid) > 50):
            error = "A value is too long"

        row = ImportRow(row=n, name=name, role=role, email=email, employee_id=eid, department=department, result="new")
        if error:
            row.result, row.message = "error", error
        elif existing is not None:
            changes = {"name": name, "role": role, "email": email}
            if "department" in header:
                changes["department"] = department
            if not existing.has_access:
                changes["has_access"] = True
            changed = [k for k, v in changes.items() if getattr(existing, k) != v]
            if changed:
                row.result, row.message = "update", "Update: " + ", ".join(_FIELD_LABELS[k] for k in changed)
            else:
                row.result = "unchanged"
        planned.append((row, existing))

    in_file = {r.employee_id for r, _ in planned if r.employee_id}
    missing = [
        ImportMissing(id=p.id, name=p.name, employee_id=p.employee_id)
        for p in sorted(people, key=lambda p: p.name)
        if p.employee_id and p.has_access and p.employee_id not in in_file
    ]
    rows = [r for r, _ in planned]
    preview = ImportPreview(
        filename=filename,
        total_rows=len(rows),
        columns_matched=len([c for c in header if c in REQUIRED_COLUMNS + OPTIONAL_COLUMNS]),
        # Problems first, then changes, so HR sees what needs attention.
        rows=sorted(rows, key=lambda r: ({"error": 0, "update": 1, "new": 2, "unchanged": 3}[r.result], r.row)),
        new_count=sum(r.result == "new" for r in rows),
        update_count=sum(r.result == "update" for r in rows),
        unchanged_count=sum(r.result == "unchanged" for r in rows),
        error_count=sum(r.result == "error" for r in rows),
        missing=missing,
    )
    return preview, planned, "department" in header


@router.post("/import", response_model=ImportPreview)
async def import_people(
    file: UploadFile = File(...),
    commit: bool = Form(False),
    remove_missing: bool = Form(False),
    session: AsyncSession = Depends(get_session),
) -> ImportPreview:
    """Preview (commit=false) or apply (commit=true) a CSV of employees.

    Rows are matched by employee ID: new IDs are added, known IDs updated, and
    rows with problems skipped, so re-importing a fixed file never duplicates
    anyone. With remove_missing, people not in the file lose sign-in access."""
    data = await file.read(MAX_CSV_BYTES + 1)
    if len(data) > MAX_CSV_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "The CSV is larger than 2 MB.")
    preview, planned, has_department = await _plan(session, data, file.filename or "upload.csv")
    if not commit:
        return preview

    for row, existing in planned:
        if row.result == "new":
            session.add(
                Person(
                    name=row.name, role=row.role, email=row.email, employee_id=row.employee_id,
                    department=row.department, has_access=True,
                )
            )
        elif row.result == "update" and existing is not None:
            existing.name, existing.role, existing.email = row.name, row.role, row.email
            if has_department:
                existing.department = row.department
            existing.has_access = True
    if remove_missing:
        missing_ids = {m.id for m in preview.missing}
        for person in (await session.execute(select(Person).where(Person.id.in_(missing_ids)))).scalars():
            person.has_access = False
    await session.commit()
    preview.committed = True
    return preview
