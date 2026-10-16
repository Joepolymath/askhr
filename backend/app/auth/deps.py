from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.jwt import verify_admin_token

_bearer = HTTPBearer(auto_error=False)


async def require_admin(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> None:
    """Dependency applied to every admin router."""
    if creds is None or not verify_admin_token(creds.credentials):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin login required",
            headers={"WWW-Authenticate": "Bearer"},
        )
