"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-11-11 14:45:28.282765

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '0001'
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('users',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('keycloak_sub', sa.String(length=255), nullable=True),
    sa.Column('role', sa.String(length=20), nullable=False),
    sa.Column('pending_role', sa.String(length=20), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('is_verified', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("pending_role IS NULL OR pending_role IN ('patient', 'therapist')", name='ck_users_pending_role'),
    sa.CheckConstraint("role IN ('patient', 'therapist', 'admin')", name='ck_users_role'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_keycloak_sub'), 'users', ['keycloak_sub'], unique=True)
    op.create_table('exercises',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('name', sa.String(length=160), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('reference_video_key', sa.String(length=512), nullable=True),
    sa.Column('joint_tolerances', sa.JSON(), nullable=False),
    sa.Column('created_by', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('description IS NULL OR length(description) <= 4000', name='ck_exercises_description_length'),
    sa.CheckConstraint('length(trim(name)) >= 2', name='ck_exercises_name_length'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_exercises_created_by'), 'exercises', ['created_by'], unique=False)
    op.create_index(op.f('ix_exercises_name'), 'exercises', ['name'], unique=False)
    op.create_table('patients',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('first_name', sa.String(length=100), nullable=False),
    sa.Column('last_name', sa.String(length=100), nullable=False),
    sa.Column('date_of_birth', sa.Date(), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('length(trim(first_name)) >= 1', name='ck_patients_first_name_not_blank'),
    sa.CheckConstraint('length(trim(last_name)) >= 1', name='ck_patients_last_name_not_blank'),
    sa.CheckConstraint('notes IS NULL OR length(notes) <= 4000', name='ck_patients_notes_length'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_patients_user_id'), 'patients', ['user_id'], unique=True)
    op.create_table('assignments',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('patient_id', sa.Uuid(), nullable=False),
    sa.Column('exercise_id', sa.Uuid(), nullable=False),
    sa.Column('therapist_id', sa.Uuid(), nullable=True),
    sa.Column('repetitions', sa.Integer(), nullable=False),
    sa.Column('sessions_per_week', sa.Integer(), nullable=False),
    sa.Column('starts_on', sa.Date(), nullable=False),
    sa.Column('ends_on', sa.Date(), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.CheckConstraint('ends_on IS NULL OR ends_on >= starts_on', name='ck_assignments_date_range'),
    sa.CheckConstraint('repetitions BETWEEN 1 AND 500', name='ck_assignments_repetitions_range'),
    sa.CheckConstraint('sessions_per_week BETWEEN 1 AND 14', name='ck_assignments_sessions_per_week_range'),
    sa.ForeignKeyConstraint(['exercise_id'], ['exercises.id'], ),
    sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ),
    sa.ForeignKeyConstraint(['therapist_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_assignments_exercise_id'), 'assignments', ['exercise_id'], unique=False)
    op.create_index(op.f('ix_assignments_patient_id'), 'assignments', ['patient_id'], unique=False)
    op.create_index(op.f('ix_assignments_therapist_id'), 'assignments', ['therapist_id'], unique=False)
    op.create_table('patient_therapists',
    sa.Column('patient_id', sa.Uuid(), nullable=False),
    sa.Column('therapist_id', sa.Uuid(), nullable=False),
    sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ),
    sa.ForeignKeyConstraint(['therapist_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('patient_id', 'therapist_id')
    )
    op.create_table('therapist_invitations',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('patient_id', sa.Uuid(), nullable=False),
    sa.Column('therapist_id', sa.Uuid(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('message', sa.Text(), nullable=True),
    sa.Column('responded_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("status IN ('pending', 'accepted', 'declined', 'revoked')", name='ck_therapist_invitations_status'),
    sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['therapist_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_therapist_invitations_patient_id'), 'therapist_invitations', ['patient_id'], unique=False)
    op.create_index(op.f('ix_therapist_invitations_status'), 'therapist_invitations', ['status'], unique=False)
    op.create_index(op.f('ix_therapist_invitations_therapist_id'), 'therapist_invitations', ['therapist_id'], unique=False)
    op.create_index('uq_therapist_invitations_pending', 'therapist_invitations', ['patient_id', 'therapist_id'], unique=True, postgresql_where=sa.text("status = 'pending'"))
    op.create_table('sessions',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('assignment_id', sa.Uuid(), nullable=False),
    sa.Column('score', sa.Float(), nullable=True),
    sa.Column('joint_deviations', sa.JSON(), nullable=False),
    sa.Column('pain_score', sa.Integer(), nullable=True),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('pain_score IS NULL OR pain_score BETWEEN 0 AND 10', name='ck_sessions_pain_score_range'),
    sa.CheckConstraint('score IS NULL OR score BETWEEN 0 AND 10', name='ck_sessions_score_range'),
    sa.ForeignKeyConstraint(['assignment_id'], ['assignments.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_sessions_assignment_id'), 'sessions', ['assignment_id'], unique=False)
    op.create_table('help_requests',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('session_id', sa.Uuid(), nullable=False),
    sa.Column('patient_id', sa.Uuid(), nullable=False),
    sa.Column('message', sa.Text(), nullable=False),
    sa.Column('reply', sa.Text(), nullable=True),
    sa.Column('replied_by', sa.Uuid(), nullable=True),
    sa.Column('replied_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('length(trim(message)) >= 1 AND length(message) <= 2000', name='ck_help_requests_message_length'),
    sa.CheckConstraint('reply IS NULL OR (length(trim(reply)) >= 1 AND length(reply) <= 2000)', name='ck_help_requests_reply_length'),
    sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ),
    sa.ForeignKeyConstraint(['replied_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['session_id'], ['sessions.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_help_requests_patient_id'), 'help_requests', ['patient_id'], unique=False)
    op.create_index(op.f('ix_help_requests_session_id'), 'help_requests', ['session_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_help_requests_session_id'), table_name='help_requests')
    op.drop_index(op.f('ix_help_requests_patient_id'), table_name='help_requests')
    op.drop_table('help_requests')
    op.drop_index(op.f('ix_sessions_assignment_id'), table_name='sessions')
    op.drop_table('sessions')
    op.drop_index('uq_therapist_invitations_pending', table_name='therapist_invitations', postgresql_where=sa.text("status = 'pending'"))
    op.drop_index(op.f('ix_therapist_invitations_therapist_id'), table_name='therapist_invitations')
    op.drop_index(op.f('ix_therapist_invitations_status'), table_name='therapist_invitations')
    op.drop_index(op.f('ix_therapist_invitations_patient_id'), table_name='therapist_invitations')
    op.drop_table('therapist_invitations')
    op.drop_table('patient_therapists')
    op.drop_index(op.f('ix_assignments_therapist_id'), table_name='assignments')
    op.drop_index(op.f('ix_assignments_patient_id'), table_name='assignments')
    op.drop_index(op.f('ix_assignments_exercise_id'), table_name='assignments')
    op.drop_table('assignments')
    op.drop_index(op.f('ix_patients_user_id'), table_name='patients')
    op.drop_table('patients')
    op.drop_index(op.f('ix_exercises_name'), table_name='exercises')
    op.drop_index(op.f('ix_exercises_created_by'), table_name='exercises')
    op.drop_table('exercises')
    op.drop_index(op.f('ix_users_keycloak_sub'), table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
