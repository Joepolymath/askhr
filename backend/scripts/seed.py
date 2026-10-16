"""Load sample documents, people and company info for Northwind Labs (fictional).

Idempotent: people are upserted by employee ID; company info is filled in when
empty; documents are skipped if an active document with the same title exists.

    docker compose exec backend python scripts/seed.py           # add missing data
    docker compose exec backend python scripts/seed.py --reset   # wipe docs, people,
                                                                  # chats, company info first

Demo sign-in: chiamaka.obi@northwindlabs.example / NWL-0126
"""
import argparse
import asyncio
import sys
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select, text  # noqa: E402

from app.db import session_factory  # noqa: E402
from app.ingestion.pipeline import find_active_by_title, ingest  # noqa: E402
from app.ingestion.validate import detect_type  # noqa: E402
from app.models import (  # noqa: E402
    CompanyInfo,
    DocCategory,
    Document,
    DocumentFile,
    DocStatus,
    Person,
    normalize_title,
)

SAMPLE_DIR = Path(__file__).resolve().parent.parent / "sample_docs"


def _date(s: str) -> datetime:
    return datetime.fromisoformat(s).replace(tzinfo=UTC)


# (title, file, category, "uploaded" date). Dates matter: the Handbook is older
# than the Leave Policy, which is how AskHR explains which one is probably current.
DOCUMENTS = [
    ("Leave Policy 2026", "leave_policy_2026.docx", DocCategory.policy, _date("2026-01-12")),
    ("Employee Handbook", "employee_handbook.pdf", DocCategory.handbook, _date("2025-11-03")),
    ("Code of Conduct", "code_of_conduct.pdf", DocCategory.policy, _date("2025-11-03")),
    ("Travel & Expenses Policy", "travel_expenses_policy.docx", DocCategory.policy, _date("2026-03-02")),
    ("Company Overview", "company_overview.md", DocCategory.org_info, _date("2026-09-02")),
]

PEOPLE = [
    dict(name="Adaeze Okonkwo", role="Chief Executive Officer", department="Executive",
         employee_id="NWL-0001", bio="Co-founded Northwind Labs in 2019. Based at the Lagos head office."),
    dict(name="Tunde Bakare", role="Chief Technology Officer", department="Engineering",
         employee_id="NWL-0003", bio="Leads the Engineering and Data teams."),
    dict(name="Funmilayo Adeyemi", role="Head of People & Culture", department="People & Culture",
         employee_id="NWL-0007", bio="Owns HR policy, benefits and employee experience."),
    dict(name="Ibrahim Musa", role="Head of Claims", department="Claims", employee_id="NWL-0012"),
    dict(name="Ngozi Eze", role="Finance Manager", department="Finance", employee_id="NWL-0019"),
    dict(name="Hauwa Abdullahi", role="Head of Underwriting", department="Underwriting", employee_id="NWL-0024"),
    dict(name="Kelechi Nwosu", role="Product Manager", department="Product", employee_id="NWL-0031"),
    dict(name="Segun Ogunleye", role="Payroll & Benefits Officer", department="People & Culture",
         employee_id="NWL-0038", bio="First point of contact for payroll, pension and HMO questions."),
    dict(name="Chiamaka Obi", role="Claims Associate", department="Claims", employee_id="NWL-0126"),
]
for _p in PEOPLE:
    first, last = _p["name"].lower().split()
    _p["email"] = f"{first}.{last}@northwindlabs.example"

COMPANY = dict(
    name="Northwind Labs",
    content=(
        "Northwind Labs is a Lagos-based digital insurer. We sell health, motor and gadget insurance "
        "through the Northwind app and a network of independent agents, and settle most claims within 48 hours."
    ),
    mission="To make insurance simple, affordable and trusted for every Nigerian household.",
    hr_contact_name="Funmilayo Adeyemi",
    hr_contact_email="hr@northwindlabs.example",
)


async def reset() -> None:
    async with session_factory()() as s:
        await s.execute(text("TRUNCATE chunks, document_files, documents, people, chat_logs CASCADE"))
        await s.execute(
            text("UPDATE company_info SET content = '', name = '', mission = '', hr_contact_name = '', hr_contact_email = ''")
        )
        await s.commit()
    print("Reset: removed documents, people, chat history and company info.")


async def seed_people_and_company() -> None:
    async with session_factory()() as s:
        existing = {p.employee_id: p for p in (await s.execute(select(Person))).scalars() if p.employee_id}
        for data in PEOPLE:
            person = existing.get(data["employee_id"])
            if person is None:
                s.add(Person(**data, has_access=True))
            else:
                for k, v in data.items():
                    setattr(person, k, v)
        info = await s.get(CompanyInfo, 1)
        if info is None:
            s.add(CompanyInfo(id=1, **COMPANY))
        elif not info.name.strip():
            for k, v in COMPANY.items():
                setattr(info, k, v)
        await s.commit()
    print(f"People: {len(PEOPLE)} upserted. Company info set.")


async def seed_documents() -> None:
    for title, filename, category, uploaded_at in DOCUMENTS:
        data = (SAMPLE_DIR / filename).read_bytes()
        async with session_factory()() as s:
            if await find_active_by_title(s, normalize_title(title)):
                print(f"  skip  {title} (already present)")
                continue
            doc = Document(
                title=title,
                title_norm=normalize_title(title),
                original_filename=filename,
                mime_type=detect_type(data, filename),
                size_bytes=len(data),
                category=category,
                status=DocStatus.processing,
                is_active=True,
                uploaded_at=uploaded_at,
            )
            s.add(doc)
            await s.flush()
            s.add(DocumentFile(document_id=doc.id, data=data))
            await s.commit()
            doc_id = doc.id
        await ingest(doc_id, data)  # same pipeline as uploads, awaited inline
        async with session_factory()() as s:
            doc = await s.get(Document, doc_id)
            print(f"  {doc.status.value:<6} {title}: {doc.chunk_count} chunks {doc.error_message or ''}")


async def main(do_reset: bool) -> None:
    if do_reset:
        await reset()
    await seed_people_and_company()
    print("Documents:")
    await seed_documents()
    print("\nDemo employee sign-in: chiamaka.obi@northwindlabs.example / NWL-0126")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true", help="delete existing data first")
    asyncio.run(main(parser.parse_args().reset))
