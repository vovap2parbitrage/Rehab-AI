"""messages from a therapist to a patient

Revision ID: 0013
Revises: 0012
Create Date: 2026-11-27 12:00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '0013'
down_revision: str | Sequence[str] | None = '0012'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'therapist_messages',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('therapist_id', sa.Uuid(), nullable=False),
        sa.Column('patient_id', sa.Uuid(), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('reply', sa.Text(), nullable=True),
        sa.Column('replied_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reply_seen_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            'length(trim(message)) >= 1 AND length(message) <= 2000',
            name='ck_therapist_messages_message_length',
        ),
        sa.CheckConstraint(
            'reply IS NULL OR (length(trim(reply)) >= 1 AND length(reply) <= 2000)',
            name='ck_therapist_messages_reply_length',
        ),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id']),
        sa.ForeignKeyConstraint(['therapist_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_therapist_messages_patient_id'), 'therapist_messages', ['patient_id'], unique=False)
    op.create_index(op.f('ix_therapist_messages_therapist_id'), 'therapist_messages', ['therapist_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_therapist_messages_therapist_id'), table_name='therapist_messages')
    op.drop_index(op.f('ix_therapist_messages_patient_id'), table_name='therapist_messages')
    op.drop_table('therapist_messages')
