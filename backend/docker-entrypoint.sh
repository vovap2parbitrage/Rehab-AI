#!/bin/sh
set -e

# The API and the Celery worker share this image. Only the API applies migrations;
# workers start after the API is healthy, so the schema is already up to date.
if [ "${SKIP_DB_INIT:-0}" != "1" ]; then
  python -m app.db.init
  alembic upgrade head
fi

exec "$@"
