"""store a SHA-256 fingerprint for successfully analysed session videos

Revision ID: 0014
Revises: 0013
Create Date: 2026-11-28 12:00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0014"
down_revision: str | Sequence[str] | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("sessions", sa.Column("video_sha256", sa.String(length=64), nullable=True))
    op.create_index("ix_sessions_video_sha256", "sessions", ["video_sha256"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_sessions_video_sha256", table_name="sessions")
    op.drop_column("sessions", "video_sha256")
