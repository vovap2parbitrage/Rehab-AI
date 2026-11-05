from sqlalchemy.orm import configure_mappers

from app.models import (
    Assignment,
    Exercise,
    Patient,
    TrainingSession,
    User,
)


def test_models_relationships_configure():
    configure_mappers()

    assert User is not None
    assert Patient is not None
    assert Exercise is not None
    assert Assignment is not None
    assert TrainingSession is not None
    assert TrainingSession.__tablename__ == "sessions"
