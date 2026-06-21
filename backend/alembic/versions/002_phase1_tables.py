"""Phase 1: users, health_metrics, proactive_logs, push_tokens + alter existing tables

Revision ID: 002_phase1
Revises: None
Create Date: 2026-05-31
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "002_phase1"
down_revision: Union[str, None] = None
branch_labels: Union[Sequence[str], None] = None
depends_on: Union[Sequence[str], None] = None


def upgrade() -> None:
    # ── users ──
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("nickname", sa.String(100), default="用户"),
        sa.Column("timezone", sa.String(50), default="Asia/Singapore"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Seed a default user
    op.execute("INSERT INTO users (id, nickname, timezone) VALUES (gen_random_uuid(), '夏一鱼', 'Asia/Singapore')")

    # ── alter personas ──
    op.add_column("personas", sa.Column("persona_type", sa.String(30), server_default="companion"))

    # ── alter conversations ──
    op.add_column("conversations", sa.Column("user_id", UUID(as_uuid=True), nullable=True))
    op.add_column("conversations", sa.Column("source", sa.String(20), server_default="app"))

    # Set existing conversations to the default user
    op.execute(
        "UPDATE conversations SET user_id = (SELECT id FROM users LIMIT 1) WHERE user_id IS NULL"
    )

    op.create_foreign_key("fk_conversations_user", "conversations", "users", ["user_id"], ["id"])

    # ── alter messages ──
    op.alter_column("messages", "conversation_id", nullable=True)
    op.add_column("messages", sa.Column("is_proactive", sa.Boolean(), server_default="false"))
    op.add_column("messages", sa.Column("source", sa.String(20), server_default="app"))

    # ── health_metrics ──
    op.create_table(
        "health_metrics",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("metric_type", sa.String(30), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(20), nullable=False),
        sa.Column("logged_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── proactive_logs ──
    op.create_table(
        "proactive_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("random_value", sa.Integer(), nullable=False),
        sa.Column("threshold", sa.Integer(), nullable=False),
        sa.Column("should_send", sa.Boolean(), default=False),
        sa.Column("llm_reason", sa.Text()),
        sa.Column("content", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── push_tokens ──
    op.create_table(
        "push_tokens",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token", sa.String(500), unique=True, nullable=False),
        sa.Column("platform", sa.String(20), default="ios"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("push_tokens")
    op.drop_table("proactive_logs")
    op.drop_table("health_metrics")
    op.drop_column("messages", "source")
    op.drop_column("messages", "is_proactive")
    op.alter_column("messages", "conversation_id", nullable=False)
    op.drop_constraint("fk_conversations_user", "conversations", type_="foreignkey")
    op.drop_column("conversations", "source")
    op.drop_column("conversations", "user_id")
    op.drop_column("personas", "persona_type")
    op.drop_table("users")
