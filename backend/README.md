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

## Запуск усього стеку

З кореня репозиторію:

```bash
docker compose up --build -d
```

Це піднімає PostgreSQL, Redis, Keycloak, FastAPI, Celery і frontend.
Деталі та адреси сервісів — у [`../README.md`](../README.md).

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
## Сервіс порівняння відео

Порівнює відео виконання вправи пацієнтом з еталонним відео лікаря й повертає оцінку (0-10),
оцінки по суглобах і сегменти помилок.

Потік (мобільний застосунок виконує ці кроки автоматично, користувач лише знімає або вибирає відео):

1. `POST /api/v1/comparisons/uploads` з `{"content_type": "video/mp4"}` повертає короткоживучу
   підписану ціль завантаження `{key, url, fields}`.
2. Застосунок завантажує відео напряму в S3-бакет (multipart POST на `url` з `fields` і файлом).
   Те саме для другого відео.
3. `POST /api/v1/comparisons` з `{reference_key, patient_key, body_parts, tolerances_deg}`
   ставить аналіз у чергу (Celery) і повертає `{task_id}` (202).
4. `GET /api/v1/comparisons/{task_id}` повертає `pending`, `done`, `rerecord`,
   `no_repetitions` або `failed`. Читати задачу може лише користувач, який її створив.

Користувачі не передають URL, тому сервер ніколи не завантажує адреси, надані користувачем.
Обмеження: `MAX_VIDEO_MB` (100) і `MAX_VIDEO_SECONDS` (120); лише mp4 і mov. Тип файлу
перевіряється за вмістом.

Авторизація: усі три ендпоінти вимагають входу (`get_current_active_user`), ідентифікатор
користувача береться з токена (`app/api/comparison_auth.py`).

### Сховище S3

Підійде будь-який S3-сумісний сервіс; він налаштовується змінними `S3_*` з `.env.example`.
Локально в `compose.yaml` у корені запускається RustFS (`s3`) разом із `s3-init`, що створює
бакет `rehab-videos`. Воркер і API отримують змінні `S3_*` у `compose.yaml`.
Для справжнього бакета змініть `S3_ENDPOINT_URL`, `S3_PUBLIC_ENDPOINT_URL`, `S3_BUCKET`,
`S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`. Бакет має бути приватним.

У `Dockerfile` встановлюються `libgl1` і `libglib2.0-0`: без них `import mediapipe`
падає в `python:3.12-slim`.

### Що ще не зроблено

- Еталонне відео поки має належати тому самому користувачу. Потрібно брати його з призначеної
  вправи й перевіряти доступ до пацієнта (див. TODO в `app/api/v1/endpoints/comparisons.py`).
- Перевірка точності на реальних людях (H2).
