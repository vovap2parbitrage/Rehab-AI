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


def test_models_define_database_constraints():
    assert {
        constraint.name
        for constraint in User.__table__.constraints
        if constraint.name
    } >= {"ck_users_role", "ck_users_pending_role"}
    assert {
        constraint.name
        for constraint in Assignment.__table__.constraints
        if constraint.name
    } >= {
        "ck_assignments_repetitions_range",
        "ck_assignments_sessions_per_week_range",
        "ck_assignments_date_range",
    }
    assert {
        constraint.name
        for constraint in TrainingSession.__table__.constraints
        if constraint.name
    } >= {"ck_sessions_score_range", "ck_sessions_pain_score_range"}
    assert {
        constraint.name
        for constraint in Patient.__table__.constraints
        if constraint.name
    } >= {
        "ck_patients_first_name_not_blank",
        "ck_patients_last_name_not_blank",
        "ck_patients_notes_length",
    }
    assert {
        constraint.name
        for constraint in Exercise.__table__.constraints
        if constraint.name
    } >= {
        "ck_exercises_name_length",
        "ck_exercises_description_length",
    }
