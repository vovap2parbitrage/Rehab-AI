from sqlalchemy.orm import configure_mappers

from app.models import (
    Assignment,
    Exercise,
    Patient,
    Session,
    User,
)


def test_models_relationships_configure():
    configure_mappers()

    assert User is not None
    assert Patient is not None
    assert Exercise is not None
    assert Assignment is not None
    assert Session is not None
