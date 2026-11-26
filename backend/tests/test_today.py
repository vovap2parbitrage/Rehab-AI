"""The therapist's Today page."""

from datetime import timedelta

import pytest

from app.core.timezones import app_today, day_bounds
from app.models.assignment import Assignment
from app.models.exercise import Exercise
from app.models.session import TrainingSession
from app.services.exercise import current_version

TODAY = app_today()
YESTERDAY = TODAY - timedelta(days=1)
ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
URL = "/api/v1/therapists/me/today"


@pytest.fixture
def exercise(db_session, therapist):
    def _make(name):
        item = Exercise(name=name, created_by=therapist.id)
        db_session.add(item)
        db_session.flush()
        return item

    return _make


@pytest.fixture
def plan_for(db_session, exercise, therapist):
    """Gives a patient an assignment from this therapist."""

    def _plan(patient, name="Squat", starts_on=TODAY - timedelta(days=14), weekdays=ALL_DAYS,
              status="active", owner=None):
        item = exercise(name)
        assignment = Assignment(
            patient_id=patient.id,
            exercise_id=item.id,
            exercise_version_id=current_version(db_session, item).id,
            therapist_id=(owner or therapist).id,
            repetitions=10,
            duration_weeks=8,
            weekdays=weekdays,
            starts_on=starts_on,
            status=status,
        )
        db_session.add(assignment)
        db_session.commit()
        return assignment

    return _plan


def done_on(db_session, assignment, day, hour=12):
    start, _ = day_bounds(day)
    db_session.add(
        TrainingSession(assignment_id=assignment.id, completed_at=start + timedelta(hours=hour))
    )
    db_session.commit()


def named(rows):
    return {row["patient_name"]: row for row in rows}


@pytest.fixture
def make_patient(db_session, therapist, seed_patient, new_user):
    def _make(first_name):
        user = new_user("patient")
        user.first_name = first_name
        user.last_name = "P"
        db_session.add(user)
        db_session.commit()
        return seed_patient(user, therapist)

    return _make


def test_the_today_page_separates_who_finished_who_did_not_and_who_missed_yesterday(
    api, login, therapist, db_session, make_patient, plan_for
):
    some = make_patient("Some")
    all_done = make_patient("Alldone")
    nothing = make_patient("Nothing")
    skipped = make_patient("Skipped")
    first = plan_for(some, "Squat")
    plan_for(some, "Lunge")
    done_on(db_session, first, TODAY)
    done_on(db_session, plan_for(all_done, "Squat"), TODAY)
    plan_for(nothing, "Squat")
    # Skipped had something yesterday only (a plan of one weekday), and never did it.
    plan_for(skipped, "Bridge", weekdays=[YESTERDAY.weekday()],
             starts_on=YESTERDAY - timedelta(days=7))
    login(therapist)

    body = api.get(URL).json()

    assert body["date"] == TODAY.isoformat()
    assert body["timezone"] == "Europe/Kyiv"
    unfinished = named(body["not_finished"])
    assert set(unfinished) == {"Some P", "Nothing P"}
    assert [(i["exercise_name"], i["done"]) for i in unfinished["Some P"]["items"]] == [
        ("Lunge", False),
        ("Squat", True),
    ]
    assert set(named(body["finished"])) == {"Alldone P"}
    assert named(body["finished"])["Alldone P"]["last_completed_at"] is not None
    # Nobody did anything yesterday, and all four had something due then.
    missed = named(body["missed_yesterday"])
    assert set(missed) == {"Some P", "Alldone P", "Nothing P", "Skipped P"}
    assert [i["exercise_name"] for i in missed["Some P"]["items"]] == ["Lunge", "Squat"]
    assert [i["exercise_name"] for i in missed["Skipped P"]["items"]] == ["Bridge"]
    assert all(not i["done"] for row in missed.values() for i in row["items"])


def test_counters_match_the_lists(api, login, therapist, db_session, make_patient, plan_for):
    done_on(db_session, plan_for(make_patient("A"), "Squat"), TODAY)
    plan_for(make_patient("B"), "Squat")
    login(therapist)

    counters = api.get(URL).json()["counters"]

    assert counters["active_patients"] == 2
    assert counters["due_today"] == 2
    assert counters["finished"] == 1
    assert counters["not_finished"] == 1
    assert counters["open_questions"] == 0


def test_a_patient_who_did_yesterday_is_not_listed_as_missing(
    api, login, therapist, db_session, make_patient, plan_for
):
    patient = make_patient("Diligent")
    done_on(db_session, plan_for(patient, "Squat"), YESTERDAY)
    login(therapist)

    body = api.get(URL).json()

    assert body["missed_yesterday"] == []


def test_a_session_done_late_in_the_evening_belongs_to_that_local_day(
    api, login, therapist, db_session, make_patient, plan_for
):
    patient = make_patient("Night")
    # 23:30 local time yesterday is already the next day in UTC+0 terms for some zones.
    done_on(db_session, plan_for(patient, "Squat"), YESTERDAY, hour=23)
    login(therapist)

    body = api.get(URL).json()

    assert body["missed_yesterday"] == []
    assert len(body["not_finished"]) == 1  # nothing done today yet


def test_an_assignment_not_due_today_is_left_out(
    api, login, therapist, make_patient, plan_for
):
    other_day = (TODAY.weekday() + 3) % 7
    plan_for(make_patient("Later"), "Squat", weekdays=[other_day])
    login(therapist)

    body = api.get(URL).json()

    assert body["not_finished"] == [] and body["finished"] == []
    assert body["counters"]["due_today"] == 0


def test_cancelled_assignments_and_other_therapists_are_left_out(
    api, login, therapist, other_therapist, make_patient, plan_for
):
    patient = make_patient("Cancelled")
    plan_for(patient, "Squat", status="cancelled")
    plan_for(patient, "Lunge", owner=other_therapist)
    login(therapist)

    body = api.get(URL).json()

    assert body["not_finished"] == [] and body["missed_yesterday"] == []


def test_an_archived_patient_is_left_out(
    api, login, therapist, make_patient, plan_for
):
    patient = make_patient("Gone")
    plan_for(patient, "Squat")
    login(therapist)
    assert api.post(f"/api/v1/patients/{patient.id}/archive").status_code == 204

    body = api.get(URL).json()

    assert body["not_finished"] == []
    assert body["counters"]["active_patients"] == 0


def test_only_a_therapist_can_open_the_page(api, login, patient_user):
    login(patient_user)

    assert api.get(URL).status_code == 403


def test_the_page_needs_a_login(api):
    assert api.get(URL).status_code == 401
