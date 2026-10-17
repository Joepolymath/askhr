from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_admin
from app.db import get_session
from app.models import CompanyInfo
from app.schemas import CompanyInfoIn, CompanyInfoOut

router = APIRouter(prefix="/api/admin/company", tags=["company"], dependencies=[Depends(require_admin)])

FIELDS = ("name", "content", "mission", "hr_contact_name", "hr_contact_email")


async def _row(session: AsyncSession) -> CompanyInfo:
    row = await session.get(CompanyInfo, 1)
    if row is None:
        row = CompanyInfo(id=1, content="", name="", mission="", hr_contact_name="", hr_contact_email="")
        session.add(row)
        await session.flush()
    return row


def _out(row: CompanyInfo) -> CompanyInfoOut:
    return CompanyInfoOut(**{f: getattr(row, f) or "" for f in FIELDS}, updated_at=row.updated_at)


@router.get("", response_model=CompanyInfoOut)
async def get_company(session: AsyncSession = Depends(get_session)) -> CompanyInfoOut:
    return _out(await _row(session))


@router.put("", response_model=CompanyInfoOut)
async def put_company(body: CompanyInfoIn, session: AsyncSession = Depends(get_session)) -> CompanyInfoOut:
    row = await _row(session)
    for f in FIELDS:
        setattr(row, f, getattr(body, f).strip())
    await session.commit()
    await session.refresh(row)
    return _out(row)
