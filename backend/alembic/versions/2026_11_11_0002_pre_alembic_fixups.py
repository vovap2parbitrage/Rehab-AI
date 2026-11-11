"""bring databases created before Alembic up to the initial schema

Before Alembic the app built tables with ``Base.metadata.create_all`` and patched
older databases by hand in ``app/db/init.py``. Such databases are stamped at 0001
(see ``app/db/init.py``) and this revision applies those manual steps. Every step
checks the current state first, so on a database created by 0001 nothing changes.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-11 15:00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '0002'
down_revision: str | Sequence[str] | None = '0001'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    _move_patient_therapist_to_join_table()
    _invitation_pending_index()
    _session_score_range()
    _assignment_therapist()


def downgrade() -> None:
    # The steps only restore the 0001 schema on old databases; there is nothing to undo.
    pass


def _move_patient_therapist_to_join_table() -> None:
    """Move the former single-therapist relation into the join table."""
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("patients")}
    if "therapist_id" not in columns:
        return

    op.execute(
        """
        INSERT INTO patient_therapists (patient_id, therapist_id)
        SELECT id, therapist_id
        FROM patients
        WHERE therapist_id IS NOT NULL
        ON CONFLICT (patient_id, therapist_id) DO NOTHING
        """
    )
    op.execute("ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_therapist_id_fkey")
    op.execute("DROP INDEX IF EXISTS ix_patients_therapist_id")
    op.execute("ALTER TABLE patients DROP COLUMN IF EXISTS therapist_id")


def _invitation_pending_index() -> None:
    """Allow repeated answered invitations: only one *pending* one per patient/therapist."""
    op.execute(
        """
        ALTER TABLE therapist_invitations
        DROP CONSTRAINT IF EXISTS uq_therapist_invitations_patient_therapist_status
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_therapist_invitations_pending
        ON therapist_invitations (patient_id, therapist_id)
        WHERE status = 'pending'
        """
    )


def _session_score_range() -> None:
    """The video analysis score is 0-10; older databases stored a 0-100 range."""
    definition = op.get_bind().execute(
        sa.text(
            """
            SELECT pg_get_constraintdef(oid)
            FROM pg_constraint
            WHERE conname = 'ck_sessions_score_range'
            """
        )
    ).scalar()
    if definition is None or "100" not in definition:
        return

    op.execute("ALTER TABLE sessions DROP CONSTRAINT ck_sessions_score_range")
    op.execute("UPDATE sessions SET score = score / 10 WHERE score > 10")
    op.execute(
        """
        ALTER TABLE sessions ADD CONSTRAINT ck_sessions_score_range
        CHECK (score IS NULL OR score BETWEEN 0 AND 10)
        """
    )


def _assignment_therapist() -> None:
    """Remember which therapist made an assignment (older databases lack the column)."""
    op.execute(
        """
        ALTER TABLE assignments
        ADD COLUMN IF NOT EXISTS therapist_id UUID REFERENCES users (id)
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_assignments_therapist_id ON assignments (therapist_id)")
    # Old assignments: best guess is the therapist who created the exercise.
    op.execute(
        """
        UPDATE assignments
        SET therapist_id = exercises.created_by
        FROM exercises
        WHERE assignments.exercise_id = exercises.id
          AND assignments.therapist_id IS NULL
        """
    )
