"""drop the per-user time zone

The application runs on one time zone (Europe/Kyiv) for everyone, so ``users.timezone``
is not needed any more.

Revision ID: 0012
Revises: 0011
Create Date: 2026-11-26 12:00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '0012'
down_revision: str | Sequence[str] | None = '0011'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column('users', 'timezone')


def downgrade() -> None:
    op.add_column(
        'users',
        sa.Column('timezone', sa.String(length=64), nullable=False, server_default='Europe/Kyiv'),
    )
