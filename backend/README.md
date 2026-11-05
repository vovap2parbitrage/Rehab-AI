# Rehab AI — FastAPI backend skeleton

Backend каркас для Rehab AI: веб-кабінет терапевта, API для мобільного застосунку пацієнта,
аналіз вправ, історія сесій та фонові задачі.

## Стек

- **FastAPI + Pydantic** — REST API та валідація.
- **PostgreSQL + SQLAlchemy 2 + Alembic** — основна БД і міграції.
- **JWT + Argon2** — основа автентифікації (auth flow потрібно завершити перед production).
- **Redis + Celery** — черга аналізу відео; HTTP-запит не має чекати завершення аналізу.
- **pytest + Ruff** — тести та CI.
- **Docker Compose** — локальні PostgreSQL і Redis.

## Структура

```text
app/
  api/v1/endpoints/       # маршрути за доменами
  core/                   # налаштування, безпека
  db/                     # engine, сесії, base
  models/                 # SQLAlchemy-моделі
  schemas/                # Pydantic-схеми
  services/               # бізнес-логіка
  tasks/                  # Celery tasks
  main.py
alembic/                  # міграції (додати після створення моделей)
tests/
```

## Запуск локально

1.
   ```bash
   # Linux/WSL/macOS
   python -m venv .venv
   source .venv/bin/activate
   # Windows PowerShell:
   .venv\\Scripts\\Activate.ps1

   pip install -e ".[dev]"
   ```
2. Створити `.env`:
   ```bash
   cp .env.example .env
   ```
3. Запусти сервіси:
   ```bash
   docker compose up -d
   ```
4. Запусти API:
   ```bash
   uvicorn app.main:app --reload
   ```
5. Перевір:
   - http://127.0.0.1:8000/health
   - http://127.0.0.1:8000/docs

## API першого каркаса

- `GET /health` — liveness check.
- `GET /api/v1/patients` — тимчасовий список-заглушка, захищений вимогою передати bearer token лише після підключення повної auth dependency; зараз повертає порожній список.
- `POST /api/v1/exercises` — заглушка створення вправи з назвою та описом.
- `POST /api/v1/assignments` — заглушка призначення вправи пацієнту.
- `POST /api/v1/sessions` — приймає метадані результату сесії; аналіз відео ще не реалізований.
## Video comparison service

Compares a patient's exercise video with the therapist's reference video and returns a
score (0-10), per-joint scores and error segments.

Flow (the mobile app does these steps automatically; the user only records or picks a video):

1. `POST /api/v1/comparisons/uploads` with `{"content_type": "video/mp4"}` returns a
   short-lived presigned upload target `{key, url, fields}`.
2. The app uploads the video straight to the S3 bucket (multipart POST to `url` with `fields`
   plus the file). Repeat for the second video.
3. `POST /api/v1/comparisons` with `{reference_key, patient_key, body_parts, tolerances_deg}`
   queues the analysis (Celery) and returns `{task_id}` (202).
4. `GET /api/v1/comparisons/{task_id}` returns `pending`, `done`, `rerecord`,
   `no_repetitions` or `failed`. Only the user who started the task can read it.

Users never send URLs, so the server never fetches user-supplied addresses.
Limits: `MAX_VIDEO_MB` (100) and `MAX_VIDEO_SECONDS` (120); only mp4 and mov.

Storage is any S3-compatible service configured with the `S3_*` variables in `.env.example`.
Local development uses a local S3 (RustFS):

```bash
docker compose -f compose.yaml -f compose.s3.yaml up -d
```

Authentication: `app/api/comparison_auth.py` rejects every request until it is connected to
the real auth dependency (see the docstring there).

### After merging `main`: wiring checklist

- Root `compose.yaml`: add to both `backend` and `celery-worker` the variables
  `S3_ENDPOINT_URL`, `S3_PUBLIC_ENDPOINT_URL`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`,
  `S3_REGION` (the worker downloads from storage, the API signs upload links), and add the
  services from `backend/compose.s3.yaml` (or point at a real bucket).
- Dockerfile: keep `main`'s version and keep the `apt-get install libgl1 libglib2.0-0` step
  (without it `import mediapipe` fails in `python:3.12-slim`).
- `app/api/comparison_auth.py`: make `require_user_id` return `str(user.id)` from
  `get_current_active_user`.
- `app/api/v1/endpoints/comparisons.py`: take the reference video from the assigned exercise
  and check the user may access that patient (see the TODO there).
