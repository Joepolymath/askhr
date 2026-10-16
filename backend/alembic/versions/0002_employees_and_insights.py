"""Employee sign-in, structured company info, stored originals, conflict/gap tracking.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-16
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("people", sa.Column("employee_id", sa.String(50)))
    op.add_column("people", sa.Column("has_access", sa.Boolean, nullable=False, server_default=sa.true()))
    op.create_unique_constraint("uq_people_employee_id", "people", ["employee_id"])
    # Sign-in looks people up by email, case-insensitively.
    op.create_index(
        "uq_people_email_lower",
        "people",
        [sa.text("lower(email)")],
        unique=True,
        postgresql_where=sa.text("email IS NOT NULL"),
    )

    op.add_column("company_info", sa.Column("name", sa.String(200), nullable=False, server_default=""))
    op.add_column("company_info", sa.Column("mission", sa.Text, nullable=False, server_default=""))
    op.add_column("company_info", sa.Column("hr_contact_name", sa.String(200), nullable=False, server_default=""))
    op.add_column("company_info", sa.Column("hr_contact_email", sa.String(320), nullable=False, server_default=""))

    op.add_column("documents", sa.Column("page_count", sa.Integer))
    op.create_table(
        "document_files",
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("data", sa.LargeBinary, nullable=False),
    )

    op.add_column("chat_logs", sa.Column("conflict", sa.Boolean, nullable=False, server_default=sa.false()))
    op.add_column("chat_logs", sa.Column("closest_document_title", sa.String(300)))
    op.add_column("chat_logs", sa.Column("gap_dismissed", sa.Boolean, nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("chat_logs", "gap_dismissed")
    op.drop_column("chat_logs", "closest_document_title")
    op.drop_column("chat_logs", "conflict")
    op.drop_table("document_files")
    op.drop_column("documents", "page_count")
    op.drop_column("company_info", "hr_contact_email")
    op.drop_column("company_info", "hr_contact_name")
    op.drop_column("company_info", "mission")
    op.drop_column("company_info", "name")
    op.drop_index("uq_people_email_lower", table_name="people")
    op.drop_constraint("uq_people_employee_id", "people")
    op.drop_column("people", "has_access")
    op.drop_column("people", "employee_id")
