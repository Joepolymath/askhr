"""Admin token issuing/verification.

Demo-level auth: one shared admin password -> short-lived HS256 JWT. This module
and deps.py are the only places that know how admins authenticate, so swapping
in SSO later means replacing these two files, not touching the routers.
"""
import hmac
from datetime import UTC, datetime, timedelta

import jwt

from app.config import get_settings

ALGORITHM = "HS256"


def check_admin_password(candidate: str) -> bool:
    # Constant-time comparison to avoid leaking the password via timing.
    return hmac.compare_digest(candidate.encode(), get_settings().admin_password.encode())


def issue_admin_token() -> tuple[str, datetime]:
    settings = get_settings()
    expires = datetime.now(UTC) + timedelta(hours=settings.jwt_expire_hours)
    token = jwt.encode({"sub": "admin", "role": "admin", "exp": expires}, settings.jwt_secret, ALGORITHM)
    return token, expires


def verify_admin_token(token: str) -> bool:
    try:
        claims = jwt.decode(token, get_settings().jwt_secret, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return False
    return claims.get("role") == "admin"
