"""Employee identity.

For the demo, employees are unauthenticated: the browser sends the name typed
on first visit. It is only recorded for HR's insights, never trusted for access
control. With SSO this becomes "read the user from the verified token".
"""


def employee_name(raw: str | None) -> str | None:
    if not raw:
        return None
    name = " ".join(raw.split())[:200]
    return name or None
