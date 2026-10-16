from fastapi import APIRouter, HTTPException, status

from app.auth.jwt import check_admin_password, issue_admin_token
from app.schemas import LoginIn, LoginOut

router = APIRouter(prefix="/api/admin", tags=["admin-auth"])


@router.post("/login", response_model=LoginOut)
async def login(body: LoginIn) -> LoginOut:
    if not check_admin_password(body.password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect password")
    token, expires = issue_admin_token()
    return LoginOut(token=token, expires_at=expires)
