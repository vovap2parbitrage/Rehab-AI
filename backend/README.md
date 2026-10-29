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
   python -m venv .venv
   # Windows PowerShell:
   .venv\\Scripts\\Activate.ps1
   pip install -e ".[dev]"
   ```
2. Створити `.env`:
   ```bash
   copy .env.example .env
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