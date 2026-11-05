import pytest
from sqlalchemy import create_engine, text

from app.core.config import settings


@pytest.mark.integration
def test_database_connection():
    engine = create_engine(settings.database_url, connect_args={"connect_timeout": 3})
    try:
        with engine.connect() as connection:
            result = connection.execute(text("SELECT 1"))
            assert result.scalar_one() == 1
    finally:
        engine.dispose()
