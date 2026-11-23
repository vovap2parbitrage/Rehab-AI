"""let a therapist hide exercises

Adds ``exercises.hidden_at``: a hidden exercise leaves the library and cannot be
assigned, but existing assignments keep working. It can be restored.

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-25 12:00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '0011'
down_revision: str | Sequence[str] | None = '0010'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('exercises', sa.Column('hidden_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('exercises', 'hidden_at')
