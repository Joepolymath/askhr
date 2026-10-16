"""Generate the binary sample documents in backend/sample_docs/.

Run once (output is committed):  python scripts/make_sample_docs.py
Northwind Labs is a fictional company; all content is sample data.
"""
from pathlib import Path

import docx
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

OUT = Path(__file__).resolve().parent.parent / "sample_docs"

LEAVE_POLICY = [
    ("h1", "Purpose and Scope"),
    ("p", "This policy explains the types of leave available to Northwind Labs employees and how to request them. It applies to all full-time and part-time employees. Part-time employees receive leave pro rata to their contracted hours. Contractors are not covered by this policy and should refer to their contract."),
    ("h1", "Annual Leave"),
    ("h2", "Entitlement"),
    ("p", "Full-time employees receive 25 days of paid annual leave per calendar year, in addition to public holidays. Leave accrues monthly at 2.08 days per month of service."),
    ("h2", "Probation Period"),
    ("p", "New employees serve a 3-month probation period. Leave accrues during probation, but annual leave cannot be taken during probation, except for up to 2 days with written approval from your manager."),
    ("h2", "Carry-Over"),
    ("p", "Up to 5 unused days of annual leave may be carried over into the next calendar year. Carried-over days must be used by 31 March, after which they are forfeited. Unused leave is not paid out except on termination of employment."),
    ("h2", "Requesting Annual Leave"),
    ("p", "Request leave in PeopleHub, our HR system. Requests of more than 3 consecutive days must be submitted at least 2 weeks in advance. Your manager will approve or decline within 5 working days."),
    ("h1", "Sick Leave"),
    ("p", "Employees receive 10 days of paid sick leave per calendar year. Notify your manager before your usual start time on the first day of absence. A doctor's note is required for absences of more than 3 consecutive working days. Unused sick leave does not carry over."),
    ("h1", "Parental Leave"),
    ("p", "Employees with at least 6 months of continuous service are eligible for parental leave. The primary caregiver receives 16 weeks of fully paid leave. The secondary caregiver receives 4 weeks of fully paid leave, which can be taken any time within the first 12 months after the birth or adoption. Notify HR at least 8 weeks before the expected start date."),
    ("h1", "Bereavement Leave"),
    ("p", "Employees may take up to 5 days of paid bereavement leave on the death of an immediate family member (partner, child, parent, sibling or grandparent), and up to 2 days for other relatives."),
    ("h1", "Public Holidays"),
    ("p", "Northwind Labs observes 10 public holidays per year according to the regional calendar of your primary office. The list is published in PeopleHub each December. Employees required to work on a public holiday receive a replacement day off."),
    ("h1", "Questions"),
    ("p", "Questions about this policy should be directed to the People team at hr@northwindlabs.example."),
]

CODE_OF_CONDUCT = [
    ("h", "1. Purpose"),
    ("p", "This Code of Conduct sets out the standards of behaviour expected of everyone who works at Northwind Labs, including employees, contractors and interns. It applies at the office, when working remotely, at company events and when representing Northwind Labs externally."),
    ("h", "2. Respect and Anti-Harassment"),
    ("p", "We treat everyone with respect. Harassment, bullying, discrimination and intimidation of any kind are not tolerated, whether in person, in writing or online. This includes unwelcome comments about a person's race, gender, sexual orientation, religion, age, disability or any other protected characteristic."),
    ("h", "3. Conflicts of Interest"),
    ("p", "Employees must avoid situations where personal interests conflict with the interests of Northwind Labs. Outside employment, investments in suppliers or competitors, and close personal relationships with people you manage must be disclosed to your manager and the People team in writing."),
    ("h", "4. Gifts and Hospitality"),
    ("p", "You may accept gifts or hospitality from customers or suppliers with a value of up to 75 US dollars. Anything above that value must be declared to your manager within 5 working days and may need to be returned. Cash or cash equivalents, such as gift cards, must never be accepted."),
    ("h", "5. Confidentiality"),
    ("p", "Customer data, source code, financial results and employee records are confidential. Share them only with people who need them to do their job. Confidentiality obligations continue after you leave the company."),
    ("h", "6. Use of Company Equipment"),
    ("p", "Company laptops and accounts are provided for work. Reasonable personal use is allowed, but you must not install unapproved software, disable security tools or store company data on personal devices. Report lost or stolen equipment to IT within 24 hours."),
    ("h", "7. Reporting Concerns"),
    ("p", "If you see something that breaks this Code, speak to your manager or the People team, or report it confidentially through the Speak Up line at ethics@northwindlabs.example. Reports can be made anonymously. Northwind Labs does not tolerate retaliation against anyone who raises a concern in good faith."),
    ("h", "8. Consequences"),
    ("p", "Breaches of this Code may lead to disciplinary action, up to and including termination of employment. Serious breaches may also be reported to the relevant authorities."),
]


def make_leave_policy() -> None:
    d = docx.Document()
    d.add_heading("Leave Policy", level=0)
    d.add_paragraph("Northwind Labs — Effective 1 January 2026 — Owner: People team")
    for kind, text in LEAVE_POLICY:
        if kind == "h1":
            d.add_heading(text, level=1)
        elif kind == "h2":
            d.add_heading(text, level=2)
        else:
            d.add_paragraph(text)
    d.save(OUT / "leave_policy.docx")


def make_code_of_conduct() -> None:
    styles = getSampleStyleSheet()
    story = [Paragraph("NORTHWIND LABS CODE OF CONDUCT", styles["Title"]), Spacer(1, 12)]
    for kind, text in CODE_OF_CONDUCT:
        story.append(Paragraph(text, styles["Heading2"] if kind == "h" else styles["BodyText"]))
        story.append(Spacer(1, 8))
    SimpleDocTemplate(str(OUT / "code_of_conduct.pdf"), pagesize=A4, title="Code of Conduct").build(story)


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    make_leave_policy()
    make_code_of_conduct()
    print(f"Wrote sample documents to {OUT}")
