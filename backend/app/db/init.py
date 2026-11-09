"""Create the database schema for local/Docker runs.

The project does not ship Alembic migrations yet, so the container entrypoint
creates the tables declared by the SQLAlchemy models on startup. Once real
migrations are added this module can be replaced with ``alembic upgrade head``.
"""

import time

from sqlalchemy import inspect, text
from sqlalchemy.exc import OperationalError

import app.models  # noqa: F401  (register all models on Base.metadata)
from app.db.base import Base
from app.db.session import engine

MAX_ATTEMPTS = 30
RETRY_DELAY_SECONDS = 2.0


def wait_for_database() -> None:
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            with engine.connect():
                return
        except OperationalError:
            if attempt == MAX_ATTEMPTS:
                raise
            time.sleep(RETRY_DELAY_SECONDS)


def init_db() -> None:
    wait_for_database()
    Base.metadata.create_all(bind=engine)
    migrate_patient_therapists()
    migrate_invitation_pending_index()
    migrate_session_score_range()
    migrate_assignment_therapist()


def migrate_invitation_pending_index() -> None:
    """Allow repeated answered invitations: only one *pending* one per patient/therapist."""
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                ALTER TABLE therapist_invitations
                DROP CONSTRAINT IF EXISTS uq_therapist_invitations_patient_therapist_status
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_therapist_invitations_pending
                ON therapist_invitations (patient_id, therapist_id)
                WHERE status = 'pending'
                """
            )
        )


def migrate_session_score_range() -> None:
    """The video analysis score is 0-10; older databases stored a 0-100 range."""
    with engine.begin() as connection:
        definition = connection.execute(
            text(
                """
                SELECT pg_get_constraintdef(oid)
                FROM pg_constraint
                WHERE conname = 'ck_sessions_score_range'
                """
            )
        ).scalar()
        if definition is None or "100" not in definition:
            return
        connection.execute(
            text("ALTER TABLE sessions DROP CONSTRAINT ck_sessions_score_range")
        )
        connection.execute(text("UPDATE sessions SET score = score / 10 WHERE score > 10"))
        connection.execute(
            text(
                """
                ALTER TABLE sessions ADD CONSTRAINT ck_sessions_score_range
                CHECK (score IS NULL OR score BETWEEN 0 AND 10)
                """
            )
        )


def migrate_assignment_therapist() -> None:
    """Remember which therapist made an assignment (older databases lack the column)."""
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                ALTER TABLE assignments
                ADD COLUMN IF NOT EXISTS therapist_id UUID REFERENCES users (id)
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_assignments_therapist_id
                ON assignments (therapist_id)
                """
            )
        )
        # Old assignments: best guess is the therapist who created the exercise.
        connection.execute(
            text(
                """
                UPDATE assignments
                SET therapist_id = exercises.created_by
                FROM exercises
                WHERE assignments.exercise_id = exercises.id
                  AND assignments.therapist_id IS NULL
                """
            )
        )


def migrate_patient_therapists() -> None:
    """Move the former single-therapist relation into the join table."""
    with engine.begin() as connection:
        columns = {
            column["name"]
            for column in inspect(connection).get_columns("patients")
        }
        if "therapist_id" not in columns:
            return

        connection.execute(
            text(
                """
                INSERT INTO patient_therapists (patient_id, therapist_id)
                SELECT id, therapist_id
                FROM patients
                WHERE therapist_id IS NOT NULL
                ON CONFLICT (patient_id, therapist_id) DO NOTHING
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE patients
                DROP CONSTRAINT IF EXISTS patients_therapist_id_fkey
                """
            )
        )
        connection.execute(text("DROP INDEX IF EXISTS ix_patients_therapist_id"))
        connection.execute(
            text("ALTER TABLE patients DROP COLUMN IF EXISTS therapist_id")
        )


def main() -> None:
    init_db()


if __name__ == "__main__":
    main()
