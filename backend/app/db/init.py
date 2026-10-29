"""Create the database schema for local/Docker runs.

The project does not ship Alembic migrations yet, so the container entrypoint
creates the tables declared by the SQLAlchemy models on startup. Once real
migrations are added this module can be replaced with ``alembic upgrade head``.
"""

import time

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


def main() -> None:
    init_db()


if __name__ == "__main__":
    main()
