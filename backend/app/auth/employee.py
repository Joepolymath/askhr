"""Employee identity gates access to the chat but is deliberately not stored with
their questions: the sign-in page promises HR sees what was asked, not who asked.
"""


def normalize_employee_id(raw: str) -> str:
    return "".join(raw.split()).upper()


def normalize_email(raw: str) -> str:
    return raw.strip().lower()
