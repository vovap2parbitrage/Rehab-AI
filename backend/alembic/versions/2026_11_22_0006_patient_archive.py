"""let a therapist archive a patient

Adds ``patient_therapists.archived_at``: set when the therapist archives the patient,
NULL while the patient is on the therapist's active list.

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-22 12:00:00

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
        'patient_therapists',
        sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('patient_therapists', 'archived_at')
