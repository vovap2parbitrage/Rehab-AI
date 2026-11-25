"""keep the reference angles for the live recording assistant

Revision ID: 0014
Revises: 0013
Create Date: 2026-11-28 12:00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '0014'
down_revision: str | Sequence[str] | None = '0013'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('exercise_versions', sa.Column('live_reference', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('exercise_versions', 'live_reference')
