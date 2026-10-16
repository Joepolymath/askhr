from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import verify_admin_token, verify_employee_token
from app.db import get_session
from app.models import Person

_bearer = HTTPBearer(auto_error=False)


async def require_admin(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> None:
    """Dependency applied to every admin router."""
    if creds is None or not verify_admin_token(creds.credentials):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin login required",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def require_employee(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: AsyncSession = Depends(get_session),
) -> Person:
    """The signed-in employee. Re-checked against the directory on every
    request, so removing access or changing an employee ID takes effect at once."""
    found = verify_employee_token(creds.credentials) if creds else None
    person = await session.get(Person, found[0]) if found else None
    if person is None or not person.has_access or person.employee_id != found[1]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Please sign in again",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return person
