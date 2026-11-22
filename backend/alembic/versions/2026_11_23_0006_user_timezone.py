"""add a time zone to users

Adds ``users.timezone`` (IANA name, default Europe/Kyiv). It decides what "today"
means when a therapist picks the start date of an assignment.

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-23 12:00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '0006'
down_revision: str | Sequence[str] | None = '0005'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('timezone', sa.String(length=64), nullable=False, server_default='Europe/Kyiv'),
    )


def downgrade() -> None:
    op.drop_column('users', 'timezone')
