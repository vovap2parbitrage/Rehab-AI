"""Prepare the database before ``alembic upgrade head`` runs on container start.

Waits for PostgreSQL and adopts databases created before Alembic: they already hold
the tables from ``Base.metadata.create_all`` but have no ``alembic_version`` table, so
they are stamped at the initial revision. Revision 0002 then applies the manual
fixups that used to live in this module.
"""

import time

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.exc import OperationalError

from app.core.config import BACKEND_DIR
from app.db.session import engine

MAX_ATTEMPTS = 30
RETRY_DELAY_SECONDS = 2.0

INITIAL_REVISION = "0001"
# Tables that create_all built on every start before Alembic was introduced.
PRE_ALEMBIC_TABLES = {
    "users",
    "exercises",
    "patients",
    "assignments",
    "patient_therapists",
    "therapist_invitations",
    "sessions",
    "help_requests",
}


def wait_for_database() -> None:
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            with engine.connect():
                return
        except OperationalError:
            if attempt == MAX_ATTEMPTS:
                raise
            time.sleep(RETRY_DELAY_SECONDS)


def alembic_config() -> Config:
    return Config(str(BACKEND_DIR / "alembic.ini"))


def adopt_pre_alembic_database() -> None:
    with engine.connect() as connection:
        tables = set(inspect(connection).get_table_names())
    if "alembic_version" in tables or not tables & PRE_ALEMBIC_TABLES:
        return

    missing = PRE_ALEMBIC_TABLES - tables
    if missing:
        raise RuntimeError(
            "The database was created before Alembic by an older app version and lacks "
            f"tables {sorted(missing)}. Start the previous version once to create them, "
            "or recreate the local database (docker compose down -v)."
        )
    command.stamp(alembic_config(), INITIAL_REVISION)


def main() -> None:
    wait_for_database()
    adopt_pre_alembic_database()


if __name__ == "__main__":
    main()
