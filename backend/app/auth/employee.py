"""Employee identity helpers.

Employees sign in with work email + employee ID (see routers/employee_auth.py).
Their identity gates access to the chat but is deliberately not stored with
their questions: the sign-in page promises HR sees what was asked, not who asked.
"""


def normalize_employee_id(raw: str) -> str:
    """Employee IDs compare case- and whitespace-insensitively ("sav-0142 " == "SAV-0142")."""
    return "".join(raw.split()).upper()


def normalize_email(raw: str) -> str:
    return raw.strip().lower()
