#!/bin/sh
set -e

# The API and the Celery worker share this image. Only the API needs the schema
# bootstrap; workers wait for PostgreSQL through their broker/DB dependencies.
if [ "${SKIP_DB_INIT:-0}" != "1" ]; then
  python -m app.db.init
fi

exec "$@"
