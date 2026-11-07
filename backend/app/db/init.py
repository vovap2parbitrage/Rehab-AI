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
