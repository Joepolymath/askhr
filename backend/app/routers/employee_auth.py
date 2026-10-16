from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_employee
from app.auth.employee import normalize_email, normalize_employee_id
from app.auth.jwt import issue_employee_token
from app.db import get_session
from app.models import CompanyInfo, Document, DocStatus, Person
from app.schemas import EmployeeLoginIn, EmployeeLoginOut, EmployeeOut, PublicInfo

router = APIRouter(prefix="/api", tags=["employee-auth"])

BAD_LOGIN = "That email and employee ID don't match"


@router.post("/auth/login", response_model=EmployeeLoginOut)
async def login(body: EmployeeLoginIn, session: AsyncSession = Depends(get_session)) -> EmployeeLoginOut:
    person = (
        await session.execute(select(Person).where(func.lower(Person.email) == normalize_email(body.email)))
    ).scalar_one_or_none()
    # One message for every failure, so the form doesn't reveal which emails exist.
    if (
        person is None
        or not person.has_access
        or person.employee_id is None
        or person.employee_id != normalize_employee_id(body.employee_id)
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, BAD_LOGIN)
    token, expires = issue_employee_token(person.id, person.employee_id, body.remember)
    return EmployeeLoginOut(token=token, expires_at=expires, employee=EmployeeOut.model_validate(person))


@router.get("/auth/me", response_model=EmployeeOut)
async def me(person: Person = Depends(require_employee)) -> Person:
    return person


@router.get("/info", response_model=PublicInfo)
async def info(session: AsyncSession = Depends(get_session)) -> PublicInfo:
    """Public: the sign-in page shows the company name and HR contact."""
    company = await session.get(CompanyInfo, 1)
    doc_count = (
        await session.execute(
            select(func.count())
            .select_from(Document)
            .where(Document.is_active.is_(True), Document.status == DocStatus.ready)
        )
    ).scalar_one()
    name = company.name if company else ""
    contact_name = company.hr_contact_name if company else ""
    contact_email = company.hr_contact_email if company else ""
    contact_person = None
    if contact_name:
        contact_person = (
            await session.execute(select(Person).where(func.lower(Person.name) == contact_name.strip().lower()))
        ).scalars().first()
    return PublicInfo(
        company_name=name,
        hr_contact_name=contact_name,
        hr_contact_role=contact_person.role if contact_person else None,
        hr_contact_email=contact_email,
        document_count=doc_count,
    )
