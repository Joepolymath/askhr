"""Initial schema: documents, chunks (pgvector), people, company_info, chat_logs.

Revision ID: 0001
Revises:
Create Date: 2026-10-16
"""
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

EMBEDDING_DIM = 1536


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    doc_category = postgresql.ENUM("policy", "handbook", "org_info", "other", name="doc_category")
    doc_status = postgresql.ENUM("processing", "ready", "failed", name="doc_status")

    op.create_table(
        "documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("title_norm", sa.String(300), nullable=False),
        sa.Column("original_filename", sa.String(500), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("size_bytes", sa.Integer, nullable=False),
        sa.Column("category", doc_category, nullable=False),
        sa.Column("status", doc_status, nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("error_message", sa.Text),
        sa.Column("chunk_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "supersedes_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="SET NULL"),
        ),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_documents_title_norm", "documents", ["title_norm"])

    op.create_table(
        "chunks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("chunk_index", sa.Integer, nullable=False),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column("section", sa.String(500)),
        sa.Column("page", sa.Integer),
        sa.Column("token_count", sa.Integer, nullable=False),
        sa.Column("embedding", Vector(EMBEDDING_DIM), nullable=False),
    )
    op.create_index("ix_chunks_document_id", "chunks", ["document_id"])
    # HNSW with cosine ops: matches the `<=>` operator used in retrieval.
    op.execute(
        "CREATE INDEX ix_chunks_embedding_hnsw ON chunks "
        "USING hnsw (embedding vector_cosine_ops)"
    )

    op.create_table(
        "people",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("role", sa.String(200), nullable=False),
        sa.Column("department", sa.String(200)),
        sa.Column("email", sa.String(320)),
        sa.Column("bio", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "company_info",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("content", sa.Text, nullable=False, server_default=""),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.execute("INSERT INTO company_info (id, content) VALUES (1, '')")

    op.create_table(
        "chat_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("employee_name", sa.String(200)),
        sa.Column("question", sa.Text, nullable=False),
        sa.Column("answer", sa.Text, nullable=False, server_default=""),
        sa.Column("citations", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("unanswered", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("top_similarity", sa.Float),
        sa.Column("rating", sa.SmallInteger),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("rated_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_chat_logs_created_at", "chat_logs", ["created_at"])
    op.create_index("ix_chat_logs_unanswered", "chat_logs", ["unanswered"])


def downgrade() -> None:
    op.drop_table("chat_logs")
    op.drop_table("company_info")
    op.drop_table("people")
    op.drop_table("chunks")
    op.drop_table("documents")
    op.execute("DROP TYPE IF EXISTS doc_status")
    op.execute("DROP TYPE IF EXISTS doc_category")
