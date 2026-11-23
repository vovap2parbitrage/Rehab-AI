"""A therapist writes to a patient; the patient can answer once."""

import uuid

import pytest

URL = "/api/v1/messages/"


@pytest.fixture
def patient(therapist, patient_user, seed_patient):
    return seed_patient(patient_user, therapist)


def send(api, patient, text="You missed yesterday's exercises. Is everything all right?"):
    return api.post(URL, json={"patient_id": str(patient.id), "message": text})


def test_a_therapist_writes_to_their_patient(api, login, therapist, patient):
    login(therapist)

    response = send(api, patient, "  Please do both exercises today  ")

    assert response.status_code == 201
    body = response.json()
    assert body["message"] == "Please do both exercises today"
    assert body["patient_id"] == str(patient.id)
    assert body["patient_name"] == "Ivan Petrenko"
    assert body["therapist_name"] == therapist.email
    assert body["reply"] is None
    assert body["reply_seen"] is False


@pytest.mark.parametrize("text", ["", "   ", "x" * 2001])
def test_the_text_must_not_be_empty_or_too_long(api, login, therapist, patient, text):
    login(therapist)

    assert send(api, patient, text).status_code == 422


def test_a_therapist_cannot_write_to_someone_elses_patient(
    api, login, other_therapist, patient
):
    login(other_therapist)

    assert send(api, patient).status_code == 403


def test_a_therapist_cannot_write_to_an_archived_patient(api, login, therapist, patient):
    login(therapist)
    api.post(f"/api/v1/patients/{patient.id}/archive")

    assert send(api, patient).status_code == 409


def test_an_unknown_patient_is_404(api, login, therapist):
    login(therapist)

    response = api.post(URL, json={"patient_id": str(uuid.uuid4()), "message": "Hello"})

    assert response.status_code == 404


def test_a_patient_cannot_send_a_message_this_way(api, login, patient_user, patient):
    login(patient_user)

    assert send(api, patient).status_code == 403


def test_the_patient_sees_only_their_own_messages_newest_first(
    api, login, therapist, patient_user, other_patient_user, patient, seed_patient
):
    other = seed_patient(other_patient_user, therapist)
    login(therapist)
    send(api, patient, "first")
    send(api, patient, "second")
    send(api, other, "for someone else")

    login(patient_user)
    messages = api.get(f"{URL}mine").json()

    assert [item["message"] for item in messages] == ["second", "first"]


def test_the_patient_can_answer_once(api, login, therapist, patient_user, patient):
    login(therapist)
    message_id = send(api, patient).json()["id"]
    login(patient_user)

    first = api.post(f"{URL}{message_id}/reply", json={"reply": "I was ill, sorry"})
    second = api.post(f"{URL}{message_id}/reply", json={"reply": "Again"})

    assert first.status_code == 200
    assert first.json()["reply"] == "I was ill, sorry"
    assert first.json()["replied_at"] is not None
    assert second.status_code == 409


def test_a_patient_cannot_answer_someone_elses_message(
    api, login, therapist, other_patient_user, patient, seed_patient
):
    login(therapist)
    message_id = send(api, patient).json()["id"]
    seed_patient(other_patient_user, therapist)
    login(other_patient_user)

    response = api.post(f"{URL}{message_id}/reply", json={"reply": "Not mine"})

    assert response.status_code == 404


def test_the_therapist_sees_replies_and_can_mark_them_seen(
    api, login, therapist, patient_user, patient
):
    login(therapist)
    message_id = send(api, patient).json()["id"]
    login(patient_user)
    api.post(f"{URL}{message_id}/reply", json={"reply": "I was ill"})

    login(therapist)
    sent = api.get(URL).json()
    assert [(item["reply"], item["reply_seen"]) for item in sent] == [("I was ill", False)]

    assert api.post(f"{URL}{message_id}/seen").status_code == 204
    assert api.get(URL).json()[0]["reply_seen"] is True


def test_the_list_can_be_limited_to_one_patient(
    api, login, therapist, other_patient_user, patient, seed_patient
):
    other = seed_patient(other_patient_user, therapist)
    login(therapist)
    send(api, patient, "to the first")
    send(api, other, "to the second")

    response = api.get(URL, params={"patient_id": str(other.id)})

    assert [item["message"] for item in response.json()] == ["to the second"]


def test_only_the_author_sees_a_message_in_their_list_or_can_mark_it(
    api, login, therapist, other_therapist, patient
):
    login(therapist)
    message_id = send(api, patient).json()["id"]

    login(other_therapist)

    assert api.get(URL).json() == []
    assert api.post(f"{URL}{message_id}/seen").status_code == 404


def test_the_today_page_counts_replies_that_have_not_been_seen(
    api, login, therapist, patient_user, patient
):
    login(therapist)
    message_id = send(api, patient).json()["id"]
    login(patient_user)
    api.post(f"{URL}{message_id}/reply", json={"reply": "Here"})
    login(therapist)

    assert api.get("/api/v1/therapists/me/today").json()["counters"]["new_replies"] == 1

    api.post(f"{URL}{message_id}/seen")

    assert api.get("/api/v1/therapists/me/today").json()["counters"]["new_replies"] == 0


def test_login_is_required(api):
    assert api.get(URL).status_code == 401
