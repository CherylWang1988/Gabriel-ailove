"""Add message_type and media_url to messages

Revision ID: 003_message_media
Revises: 002_phase1
Create Date: 2026-06-14
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "003_message_media"
down_revision: Union[str, None] = "002_phase1"
branch_labels: Union[Sequence[str], None] = None
depends_on: Union[Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("message_type", sa.String(20), server_default="text"))
    op.add_column("messages", sa.Column("media_url", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("messages", "media_url")
    op.drop_column("messages", "message_type")
