from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, configure_mappers

from app.db.base import Base
from app.models import (
    Assignment,
    Exercise,
    Patient,
    TherapistInvitation,
    TrainingSession,
    User,
)
from app.models.patient_therapist import patient_therapist_table


def test_models_relationships_configure():
    configure_mappers()

    assert User is not None
    assert Patient is not None
    assert Exercise is not None
    assert TherapistInvitation is not None
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
    assert {
        constraint.name
        for constraint in TherapistInvitation.__table__.constraints
        if constraint.name
    } >= {"ck_therapist_invitations_status"}
    pending_index = next(
        index
        for index in TherapistInvitation.__table__.indexes
        if index.name == "uq_therapist_invitations_pending"
    )
    assert pending_index.unique


def test_patient_therapist_join_table_has_two_composite_keys():
    assert patient_therapist_table.primary_key.columns.keys() == [
        "patient_id",
        "therapist_id",
    ]
    assert {
        foreign_key.target_fullname
        for column in patient_therapist_table.columns
        for foreign_key in column.foreign_keys
    } == {"patients.id", "users.id"}


def test_patient_can_have_multiple_therapists_and_invitation():
    engine = create_engine("sqlite:///:memory:")

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)

    with Session(engine) as db:
        patient_user = User(
            email="patient@example.com",
            role="patient",
            is_active=True,
            is_verified=True,
        )
        first_therapist = User(
            email="first@example.com",
            role="therapist",
            is_active=True,
            is_verified=True,
        )
        second_therapist = User(
            email="second@example.com",
            role="therapist",
            is_active=True,
            is_verified=True,
        )
        patient = Patient(
            user=patient_user,
            first_name="Ivan",
            last_name="Petrenko",
            therapists=[first_therapist, second_therapist],
        )
        invitation = TherapistInvitation(
            patient=patient,
            therapist=first_therapist,
            status="pending",
        )
        db.add(invitation)
        db.commit()
        db.expire_all()

        stored_patient = db.query(Patient).one()
        stored_invitation = db.query(TherapistInvitation).one()

        assert {therapist.email for therapist in stored_patient.therapists} == {
            "first@example.com",
            "second@example.com",
        }
        assert stored_invitation.patient_id == stored_patient.id
        assert stored_invitation.therapist_id == first_therapist.id
        assert stored_invitation.status == "pending"
