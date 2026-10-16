from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_admin
from app.db import get_session
from app.models import CompanyInfo
from app.schemas import CompanyInfoIO

router = APIRouter(prefix="/api/admin/company", tags=["company"], dependencies=[Depends(require_admin)])


async def _row(session: AsyncSession) -> CompanyInfo:
    row = await session.get(CompanyInfo, 1)
    if row is None:  # migration seeds it, but be robust to a manual delete
        row = CompanyInfo(id=1, content="")
        session.add(row)
        await session.flush()
    return row


@router.get("", response_model=CompanyInfoIO)
async def get_company(session: AsyncSession = Depends(get_session)) -> CompanyInfoIO:
    return CompanyInfoIO(content=(await _row(session)).content)


@router.put("", response_model=CompanyInfoIO)
async def put_company(body: CompanyInfoIO, session: AsyncSession = Depends(get_session)) -> CompanyInfoIO:
    row = await _row(session)
    row.content = body.content.strip()
    await session.commit()
    return CompanyInfoIO(content=row.content)
