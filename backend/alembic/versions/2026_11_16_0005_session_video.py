"""link a session to the patient's video

Adds ``sessions.video_key``: the object key of the video the analysis was run on.

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-16 12:00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '0005'
down_revision: str | Sequence[str] | None = '0004'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('sessions', sa.Column('video_key', sa.String(length=512), nullable=True))
    op.create_unique_constraint('uq_sessions_video_key', 'sessions', ['video_key'])


def downgrade() -> None:
    op.drop_constraint('uq_sessions_video_key', 'sessions', type_='unique')
    op.drop_column('sessions', 'video_key')
