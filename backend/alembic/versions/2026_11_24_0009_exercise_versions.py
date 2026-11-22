"""exercise versions

Every exercise gets version 1 (a frozen copy of its reference video, body parts and
tolerances). Assignments are pinned to a version, and sessions scored by the video
analysis remember the version they were scored against.

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-24 12:00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '0009'
down_revision: str | Sequence[str] | None = '0008'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'exercise_versions',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('exercise_id', sa.Uuid(), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('reference_video_key', sa.String(length=512), nullable=True),
        sa.Column('body_parts', sa.JSON(), nullable=False),
        sa.Column('joint_tolerances', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['exercise_id'], ['exercises.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('exercise_id', 'version', name='uq_exercise_versions_exercise_version'),
    )
    op.create_index(op.f('ix_exercise_versions_exercise_id'), 'exercise_versions', ['exercise_id'], unique=False)

    # Version 1 of every existing exercise is a copy of its current state.
    op.execute(
        """
        INSERT INTO exercise_versions
            (id, exercise_id, version, reference_video_key, body_parts, joint_tolerances)
        SELECT gen_random_uuid(), id, 1, reference_video_key, body_parts, joint_tolerances
        FROM exercises
        """
    )

    # Existing assignments are pinned to version 1 of their exercise.
    op.add_column('assignments', sa.Column('exercise_version_id', sa.Uuid(), nullable=True))
    op.execute(
        """
        UPDATE assignments AS a
        SET exercise_version_id = v.id
        FROM exercise_versions AS v
        WHERE v.exercise_id = a.exercise_id AND v.version = 1
        """
    )
    op.alter_column('assignments', 'exercise_version_id', nullable=False)
    op.create_foreign_key(
        'fk_assignments_exercise_version_id', 'assignments', 'exercise_versions',
        ['exercise_version_id'], ['id'],
    )
    op.create_index(op.f('ix_assignments_exercise_version_id'), 'assignments', ['exercise_version_id'], unique=False)

    # Sessions made by the video analysis remember the version they were scored against.
    op.add_column('sessions', sa.Column('exercise_version_id', sa.Uuid(), nullable=True))
    op.execute(
        """
        UPDATE sessions AS s
        SET exercise_version_id = a.exercise_version_id
        FROM assignments AS a
        WHERE a.id = s.assignment_id AND s.comparison_task_id IS NOT NULL
        """
    )
    op.create_foreign_key(
        'fk_sessions_exercise_version_id', 'sessions', 'exercise_versions',
        ['exercise_version_id'], ['id'],
    )


def downgrade() -> None:
    op.drop_constraint('fk_sessions_exercise_version_id', 'sessions', type_='foreignkey')
    op.drop_column('sessions', 'exercise_version_id')
    op.drop_index(op.f('ix_assignments_exercise_version_id'), table_name='assignments')
    op.drop_constraint('fk_assignments_exercise_version_id', 'assignments', type_='foreignkey')
    op.drop_column('assignments', 'exercise_version_id')
    op.drop_index(op.f('ix_exercise_versions_exercise_id'), table_name='exercise_versions')
    op.drop_table('exercise_versions')
