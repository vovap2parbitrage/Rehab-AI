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
alembic/versions/         # Alembic-міграції
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
4. Застосуй міграції БД:
   ```bash
   alembic upgrade head
   ```
5. Запусти API:
   ```bash
   uvicorn app.main:app --reload
   ```
6. Перевір:
   - http://127.0.0.1:8000/health
   - http://127.0.0.1:8000/docs

## Міграції БД (Alembic)

Схему БД задають міграції в `alembic/versions/`, а не `Base.metadata.create_all`.
Під час старту контейнер `backend` виконує:

1. `python -m app.db.init`: чекає на PostgreSQL і переводить на Alembic базу, створену
   до появи міграцій (див. нижче);
2. `alembic upgrade head`: застосовує всі нові міграції.

Команди `alembic` запускаються з каталогу `backend/`. URL бази береться з `DATABASE_URL`
(змінна середовища або `.env`) через `app.core.config`, тому в `alembic.ini` його немає.

### Як створити нову міграцію

1. Зміни або додай модель у `app/models/`. Нову модель обов'язково імпортуй в
   `app/models/__init__.py`, інакше Alembic її не побачить.
2. Онови локальну БД до останньої ревізії:
   ```bash
   alembic upgrade head
   ```
3. Згенеруй міграцію з різниці між моделями та БД:
   ```bash
   alembic revision --autogenerate -m "add exercise difficulty"
   ```
4. Перевір створений файл в `alembic/versions/`. Autogenerate не бачить:
   - перейменувань таблиць і колонок (замість них генерує видалення та створення, тобто втрату даних);
   - змін у `CheckConstraint`;
   - перенесення або виправлення даних.

   Такі кроки допиши вручну через `op.alter_column(...)`, `op.execute("...")` тощо.
5. Перевір, що міграція застосовується і відкочується:
   ```bash
   alembic upgrade head
   alembic downgrade -1
   alembic upgrade head
   ```
6. Переконайся, що моделі й міграції збігаються. Команда має вивести
   `No new upgrade operations detected.`:
   ```bash
   alembic check
   ```
7. Закоміть міграцію разом зі зміною моделей.

Корисні команди: `alembic current` (поточна ревізія БД), `alembic history` (список
міграцій), `alembic upgrade head --sql` (показати SQL без виконання).

### Бази, створені до Alembic

Раніше таблиці створював `create_all`, а старі бази виправлялися вручну в `app/db/init.py`.
Якщо в базі є таблиці застосунку, але немає `alembic_version`, `app/db/init.py` позначає її
ревізією `0001` (`alembic stamp`). Міграція `0002` виконує колишні ручні кроки (перенесення
`patients.therapist_id` у `patient_therapists`, індекс pending-запрошень, діапазон балу
0–10, `assignments.therapist_id`). На новій базі вона нічого не змінює. Якщо в старій базі
бракує таблиць, старт зупиняється з помилкою. Для локальної бази простіше її перестворити:
`docker compose down -v`.

### Тести та CI

Тести створюють схему з моделей (`tests/conftest.py`), щоб працювати швидко. Тому окремий
крок у CI (`.github/workflows/backend-ci.yml`) на чистій PostgreSQL виконує
`alembic upgrade head`, `alembic check` (падає, якщо модель змінили без міграції), а потім
`alembic downgrade base` і повторний `alembic upgrade head`.

## API першого каркаса

- `GET /health` — liveness check.
- `GET /api/v1/patients` — тимчасовий список-заглушка, захищений вимогою передати bearer token лише після підключення повної auth dependency; зараз повертає порожній список.
- `POST /api/v1/exercises` — заглушка створення вправи з назвою та описом.
- `POST /api/v1/assignments` — заглушка призначення вправи пацієнту.
- `POST /api/v1/sessions` — приймає метадані результату сесії; аналіз відео ще не реалізований.

## Video-comparison service

### Призначення

Лікар один раз записує еталонне відео вправи. Пацієнт знімає своє виконання, а сервіс порівнює
рух пацієнта з еталоном і повертає **оцінку правильності від 0 до 10**, оцінки по суглобах і
**список помилок** (який суглоб, в який момент, наскільки відхилився і в який бік). Якщо
потрібні частини тіла погано видно, сервіс не видає хибний бал, а просить перезняти відео.

### Як це працює (логіка)

```text
Застосунок --(1) квиток--> API --> підписане посилання на S3
Застосунок --(2) відео---> S3  (напряму, повз сервер)
Застосунок --(3) ключі---> API --> Redis --> Celery worker --> S3 (читає відео)
                                                  |
                                          MediaPipe + порівняння
Застосунок <-(4) результат-- API <-- Redis <-----+
```

Кроки аналізу (`app/services/comparison/`):

1. **Скелет (`pose.py`)**: MediaPipe знаходить 33 точки тіла в кожному кадрі разом із
   видимістю кожної точки.
2. **Кути (`angles.py`)**: для вибраних частин тіла (`left_arm`, `right_arm`, `left_leg`,
   `right_leg`, `torso`) рахуються кути суглобів (лікті, плечі, стегна, коліна) і нахил торса.
3. **Якість (`pipeline.py`)**: якщо суглоби видно менш ніж у 80% кадрів, результат `rerecord`.
4. **Згладжування (`signal_utils.py`)**: медіанний фільтр і фільтр Савицького-Голея прибирають
   шум, пропуски заповнюються інтерполяцією.
5. **Повторення (`repetitions.py`)**: за провалами головного кута відео пацієнта ділиться на
   повторення. Якщо жодного не знайдено, результат `no_repetitions`.
6. **Вирівнювання (`dtw.py`)**: кожне повторення вирівнюється з еталоном алгоритмом DTW, тому
   різна швидкість виконання не вважається помилкою.
7. **Оцінка (`scoring.py`)**: відхилення кута від еталона в межах допуску не штрафується (за
   замовчуванням 10 градусів, допуск можна задати для кожного суглоба). Далі штраф росте
   лінійно і досягає максимуму при подвійному допуску. Бал = `10 x (1 - середній штраф)`.
   Послідовні відхилення об'єднуються в сегменти помилок (не коротші за 0,3 с).

### API

1. `POST /api/v1/comparisons/uploads` з `{"content_type": "video/mp4"}` (або `video/quicktime`)
   повертає короткоживучу підписану ціль завантаження `{key, url, fields}`.
2. Застосунок завантажує відео напряму в S3-бакет (multipart POST на `url` з `fields` і файлом).
   Те саме для другого відео.
3. `POST /api/v1/comparisons` з `{reference_key, patient_key, body_parts, tolerances_deg}`
   ставить аналіз у чергу і повертає `{task_id}` (202). `tolerances_deg` необов'язковий,
   ключі: `l_elbow`, `r_elbow`, `l_shoulder`, `r_shoulder`, `l_hip`, `r_hip`, `l_knee`,
   `r_knee`, `torso_tilt`; значення від 0 (не включно) до 90 градусів.
4. `GET /api/v1/comparisons/{task_id}` повертає статус `pending`, `done`, `rerecord`,
   `no_repetitions` або `failed`. Читати задачу може лише користувач, який її створив.

Приклад відповіді зі статусом `done`:

```json
{
  "task_id": "...", "status": "done", "score": 7.8, "worst_repetition_score": 6.9,
  "repetitions": 5, "repetition_scores": [8.1, 7.9, 7.6, 7.8, 6.9],
  "joint_scores": {"r_hip": 8.4, "r_knee": 7.2},
  "errors": [{"joint": "r_knee", "start_s": 2.1, "end_s": 2.8,
              "peak_deviation_deg": 18.4, "direction": "too_straight"}],
  "quality": {"reference_valid_frames_pct": 96.0, "patient_valid_frames_pct": 91.5, "ok": true}
}
```

Користувачі не передають URL, тому сервер ніколи не завантажує адреси, надані користувачем.
Обмеження: `MAX_VIDEO_MB` (100) і `MAX_VIDEO_SECONDS` (120); лише mp4 і mov. Тип файлу
перевіряється за вмістом. Усі ендпоінти вимагають входу (`app/api/comparison_auth.py`).

### Сховище S3

Підійде будь-який S3-сумісний сервіс; він налаштовується змінними `S3_*` з `.env.example`.
Локально в `compose.yaml` у корені запускається RustFS (`s3`) разом із `s3-init`, що створює
бакет `rehab-videos`. Для справжнього бакета змініть `S3_ENDPOINT_URL`,
`S3_PUBLIC_ENDPOINT_URL`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`.
Бакет має бути приватним, а ключі доступу окремими, з правами лише на цей бакет.

У `Dockerfile` встановлюються `libgl1` і `libglib2.0-0`: без них `import mediapipe`
падає в `python:3.12-slim`.

### Локальний тест для порівняння відео

~/compare_demo.sh "token" backend/tests/data/reference.mp4 backend/tests/data/patient_good.mp4 list of important body parts 

### Що ще не зроблено

- Еталонне відео поки має належати тому самому користувачу. Потрібно брати його з призначеної
  вправи й перевіряти доступ до пацієнта (див. TODO в `app/api/v1/endpoints/comparisons.py`).
- Результати і відео не зберігаються в БД (лише ключі в S3 і результат у Redis на 24 години).
