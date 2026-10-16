"""Load sample documents, people and company info.

Idempotent: people and company info are upserted; documents are skipped if an
active document with the same title already exists.

    docker compose exec backend python scripts/seed.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from app.db import session_factory  # noqa: E402
from app.ingestion.pipeline import find_active_by_title, ingest  # noqa: E402
from app.ingestion.validate import detect_type  # noqa: E402
from app.models import CompanyInfo, DocCategory, Document, DocStatus, Person, normalize_title  # noqa: E402

SAMPLE_DIR = Path(__file__).resolve().parent.parent / "sample_docs"

DOCUMENTS = [
    ("Leave Policy", "leave_policy.docx", DocCategory.policy),
    ("Code of Conduct", "code_of_conduct.pdf", DocCategory.policy),
    ("Company Overview", "company_overview.md", DocCategory.org_info),
]

PEOPLE = [
    dict(name="Amara Okafor", role="Chief Executive Officer (CEO)", department="Executive",
         email="amara.okafor@northwindlabs.example", bio="Co-founded Northwind Labs in 2017."),
    dict(name="Priya Raman", role="Chief Technology Officer (CTO)", department="Engineering",
         email="priya.raman@northwindlabs.example", bio="Leads engineering, product infrastructure and security."),
    dict(name="Sofia Martinez", role="Chief Financial Officer (CFO)", department="Finance",
         email="sofia.martinez@northwindlabs.example"),
    dict(name="Daniel Brooks", role="Head of People (HR Lead)", department="People",
         email="daniel.brooks@northwindlabs.example", bio="Owns HR policy, benefits and employee experience."),
    dict(name="Leila Haddad", role="HR Business Partner", department="People",
         email="leila.haddad@northwindlabs.example", bio="First point of contact for leave and onboarding questions."),
    dict(name="Kenji Watanabe", role="VP of Engineering", department="Engineering",
         email="kenji.watanabe@northwindlabs.example"),
]

COMPANY_INFO = """Company name: Northwind Labs (fictional demo company)
What we do: Route-optimisation and fleet-planning software for mid-sized freight and delivery companies. Main product: Northwind Route.
Mission: Make every delivery on time, with fewer miles driven.
Founded: 2017. Headquarters: Austin, Texas, with a second office in Lisbon, Portugal. Around 180 employees.
HR contact: hr@northwindlabs.example"""


async def seed_people_and_company() -> None:
    async with session_factory()() as s:
        existing = {p.name: p for p in (await s.execute(select(Person))).scalars()}
        for data in PEOPLE:
            person = existing.get(data["name"])
            if person is None:
                s.add(Person(**data))
            else:
                for k, v in data.items():
                    setattr(person, k, v)
        info = await s.get(CompanyInfo, 1)
        if info is None:
            s.add(CompanyInfo(id=1, content=COMPANY_INFO))
        elif not info.content.strip():
            info.content = COMPANY_INFO
        await s.commit()
    print(f"People: {len(PEOPLE)} upserted. Company info set.")


async def seed_documents() -> None:
    for title, filename, category in DOCUMENTS:
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
            )
            s.add(doc)
            await s.commit()
            doc_id = doc.id
        await ingest(doc_id, data)  # same pipeline as uploads, awaited inline
        async with session_factory()() as s:
            doc = await s.get(Document, doc_id)
            print(f"  {doc.status.value:<6} {title}: {doc.chunk_count} chunks {doc.error_message or ''}")


async def main() -> None:
    await seed_people_and_company()
    print("Documents:")
    await seed_documents()


if __name__ == "__main__":
    asyncio.run(main())
