# Rehab AI

Вебзастосунок Rehab AI: React-фронтенд, FastAPI backend, PostgreSQL, Redis, Celery
та Keycloak. Усе запускається однією командою через Docker Compose.

## Швидкий старт

```bash
docker compose up --build -d
```

Після старту:

| Сервіс | Адреса |
| --- | --- |
| Вебзастосунок | http://localhost:3000 |
| API та Swagger UI | http://localhost:8001/docs |
| Keycloak Admin Console | http://localhost:8081/admin |
| PostgreSQL | `localhost:5433` |
| Redis | `localhost:6380` |

Перевірити стан контейнерів:

```bash
docker compose ps
```

Зупинити стек:

```bash
docker compose down
```

Зупинити та видалити всі дані (БД, Redis, імпортований realm):

```bash
docker compose down -v
```

## Демо-користувачі

Realm `rehab-ai` імпортується автоматично під час першого запуску Keycloak.
Дані Keycloak зберігаються у volume `keycloak_data`, тому повторний запуск не
перезаписує зміни. Щоб повторно імпортувати `keycloak/realm-export.json`,
виконайте `docker compose down -v`.
Пароль усіх демо-користувачів: `Rehab123!`.

| Логін | Роль |
| --- | --- |
| `patient` | Пацієнт |
| `therapist` | Лікар |
| `admin` | Адміністратор |

Адміністратор Keycloak (не плутати з користувачем застосунку): `admin` / `admin`.

## Що входить до стеку

- `frontend` — збірка Vite у nginx, SPA fallback.
- `backend` — FastAPI + Uvicorn. Під час старту створює таблиці SQLAlchemy.
- `celery-worker` — фоновий воркер для аналізу відео.
- `db` — PostgreSQL 16.
- `redis` — Redis 7 (брокер Celery).
- `keycloak` — Keycloak 26 з імпортом realm `rehab-ai`.
- `keycloak-init` — одноразова задача, яка додає роль `patient` до стандартної
  ролі нових користувачів.

## Налаштування

Усі значення мають робочі типові значення. Щоб змінити порти, паролі або URL:

```bash
copy .env.example .env
```

Потім відредагуйте `.env` і перезапустіть:

```bash
docker compose up -d --build
```

Важливо: `VITE_API_BASE_URL` і `KEYCLOAK_PUBLIC_URL` вбудовуються у фронтенд під час
збірки, тому після їх зміни потрібен `--build`. Якщо змінюєте порт фронтенду,
додайте новий redirect URI у `keycloak/realm-export.json`.

## Безпека

Типові секрети (`SECRET_KEY`, пароль Keycloak admin, секрет `rehab-ai-admin`)
призначені лише для локальної розробки. Для production:

- змініть усі секрети в `.env` та `keycloak/realm-export.json`;
- увімкніть HTTPS і вимкніть `start-dev` у Keycloak;
- замініть автоматичне створення таблиць на Alembic-міграції.

## Розробка без Docker

Інструкції для окремого запуску backend і frontend є в
[`backend/README.md`](backend/README.md) та [`frontend/README.md`](frontend/README.md).
