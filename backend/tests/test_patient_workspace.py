import uuid
from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.dependencies import get_db
from app.main import app
from app.models.assignment import Assignment
from app.models.exercise import Exercise
from app.models.invitation import TherapistInvitation
from app.models.patient import Patient
from app.models.session import TrainingSession
from app.models.user import User


@pytest.fixture
def patient_workspace_db(api):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    db = Session(engine)
    app.dependency_overrides[get_db] = lambda: db
    try:
        yield db
    finally:
        app.dependency_overrides.pop(get_db, None)
        db.close()
        engine.dispose()


def create_patient(db: Session, owner: User, therapist: User) -> Patient:
    db.add_all([owner, therapist])
    db.flush()
    patient = Patient(
        user_id=owner.id,
        first_name="Ivan",
        last_name="Petrenko",
    )
    db.add(patient)
    db.flush()
    return patient


def test_patient_lists_active_therapists_only(
    api, login, patient_user, therapist, other_therapist, patient_workspace_db
):
    inactive = User(
        id=uuid.uuid4(),
        email="inactive@example.com",
        role="therapist",
        is_active=False,
        is_verified=True,
    )
    patient_workspace_db.add_all([patient_user, therapist, other_therapist, inactive])
    patient_workspace_db.commit()
    login(patient_user)

    response = api.get("/api/v1/patient-workspace/doctors")

    assert response.status_code == 200
    assert {doctor["id"] for doctor in response.json()} == {
        str(therapist.id),
        str(other_therapist.id),
    }


@pytest.mark.parametrize("response_status", ["accepted", "declined"])
def test_patient_can_respond_to_invitation(
    api, login, patient_user, therapist, patient_workspace_db, response_status
):
    patient = create_patient(patient_workspace_db, patient_user, therapist)
    invitation = TherapistInvitation(
        patient_id=patient.id,
        therapist_id=therapist.id,
        status="pending",
        message="Запрошую до співпраці",
    )
    patient_workspace_db.add(invitation)
    patient_workspace_db.commit()
    login(patient_user)

    response = api.patch(
        f"/api/v1/patient-workspace/invitations/{invitation.id}",
        json={"status": response_status},
    )

    assert response.status_code == 200
    assert response.json()["status"] == response_status
    assert response.json()["therapist_email"] == therapist.email
    assert response.json()["responded_at"] is not None
    patient_workspace_db.refresh(patient)
    expected_therapists = [therapist.id] if response_status == "accepted" else []
    assert [linked.id for linked in patient.therapists] == expected_therapists


def test_patient_lists_own_invitations_including_revoked_only(
    api, login, patient_user, other_patient_user, therapist, other_therapist,
    patient_workspace_db,
):
    own_patient = create_patient(patient_workspace_db, patient_user, therapist)
    other_patient = create_patient(patient_workspace_db, other_patient_user, other_therapist)
    own_invitation = TherapistInvitation(
        patient_id=own_patient.id,
        therapist_id=therapist.id,
        status="revoked",
    )
    patient_workspace_db.add_all(
        [
            own_invitation,
            TherapistInvitation(
                patient_id=other_patient.id,
                therapist_id=other_therapist.id,
                status="pending",
            ),
        ]
    )
    patient_workspace_db.commit()
    login(patient_user)

    response = api.get("/api/v1/patient-workspace/invitations")

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["id"] == str(own_invitation.id)
    assert response.json()[0]["status"] == "revoked"


@pytest.mark.parametrize("invitation_status", ["accepted", "declined", "revoked"])
def test_patient_cannot_respond_to_non_pending_invitation(
    api, login, patient_user, therapist, patient_workspace_db, invitation_status
):
    patient = create_patient(patient_workspace_db, patient_user, therapist)
    invitation = TherapistInvitation(
        patient_id=patient.id,
        therapist_id=therapist.id,
        status=invitation_status,
    )
    patient_workspace_db.add(invitation)
    patient_workspace_db.commit()
    login(patient_user)

    response = api.patch(
        f"/api/v1/patient-workspace/invitations/{invitation.id}",
        json={"status": "accepted"},
    )

    assert response.status_code == 409


def test_patient_sees_only_own_assignments_and_persisted_sessions(
    api,
    login,
    patient_user,
    other_patient_user,
    therapist,
    other_therapist,
    patient_workspace_db,
):
    patient = create_patient(patient_workspace_db, patient_user, therapist)
    other_patient = create_patient(patient_workspace_db, other_patient_user, other_therapist)
    exercise = Exercise(name="Knee extension", created_by=therapist.id)
    other_exercise = Exercise(name="Ankle mobility", created_by=other_therapist.id)
    patient_workspace_db.add_all([exercise, other_exercise])
    patient_workspace_db.flush()
    assignment = Assignment(
        patient_id=patient.id,
        exercise_id=exercise.id,
        repetitions=10,
        sessions_per_week=3,
        starts_on=date(2026, 1, 1),
    )
    patient_workspace_db.add_all(
        [
            assignment,
            Assignment(
                patient_id=other_patient.id,
                exercise_id=other_exercise.id,
                repetitions=8,
                sessions_per_week=2,
                starts_on=date(2026, 1, 1),
            ),
        ]
    )
    patient_workspace_db.flush()
    session = TrainingSession(assignment_id=assignment.id, pain_score=2)
    patient_workspace_db.add(session)
    patient_workspace_db.commit()
    login(patient_user)

    response = api.get("/api/v1/patient-workspace/assignments")

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["exercise"]["name"] == "Knee extension"
    assert response.json()[0]["sessions"][0]["pain_score"] == 2


def test_patient_completes_own_assignment_session(
    api, login, patient_user, therapist, patient_workspace_db
):
    patient = create_patient(patient_workspace_db, patient_user, therapist)
    exercise = Exercise(name="Knee extension", created_by=therapist.id)
    patient_workspace_db.add(exercise)
    patient_workspace_db.flush()
    assignment = Assignment(
        patient_id=patient.id,
        exercise_id=exercise.id,
        repetitions=10,
        sessions_per_week=3,
        starts_on=date(2026, 1, 1),
    )
    patient_workspace_db.add(assignment)
    patient_workspace_db.commit()
    login(patient_user)

    response = api.post(
        f"/api/v1/patient-workspace/assignments/{assignment.id}/sessions",
        json={"pain_score": 3},
    )

    assert response.status_code == 201
    assert response.json()["assignment_id"] == str(assignment.id)
    assert response.json()["pain_score"] == 3
    assert response.json()["completed_at"] is not None
    assert patient_workspace_db.query(TrainingSession).count() == 1
