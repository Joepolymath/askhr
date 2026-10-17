import hmac
import uuid
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


EMPLOYEE_SESSION_HOURS = 12
EMPLOYEE_REMEMBER_DAYS = 30


def issue_employee_token(person_id: uuid.UUID, employee_id: str, remember: bool) -> tuple[str, datetime]:
    lifetime = timedelta(days=EMPLOYEE_REMEMBER_DAYS) if remember else timedelta(hours=EMPLOYEE_SESSION_HOURS)
    expires = datetime.now(UTC) + lifetime
    # `eid` ties the token to the current employee ID: changing it in the
    # directory signs that person out everywhere.
    claims = {"sub": str(person_id), "role": "employee", "eid": employee_id, "exp": expires}
    return jwt.encode(claims, get_settings().jwt_secret, ALGORITHM), expires


def verify_employee_token(token: str) -> tuple[uuid.UUID, str] | None:
    try:
        claims = jwt.decode(token, get_settings().jwt_secret, algorithms=[ALGORITHM])
        if claims.get("role") != "employee":
            return None
        return uuid.UUID(claims["sub"]), str(claims["eid"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None
