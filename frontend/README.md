# AIRehab — вебфронтенд

React + TypeScript + Vite застосунок для пацієнтів і лікарів AIRehab: кабінет пацієнта,
кабінет лікаря, публічна сторінка тарифів. Авторизація повністю делегована Keycloak
(OpenID Connect, Authorization Code Flow + PKCE), дані профілю й кабінетів надходять із
FastAPI. Огляд продукту та запуск усього стеку: [`../README.md`](../README.md).

- [Вимоги](#вимоги)
- [Команди](#команди)
- [Тести](#тести)
- [Змінні середовища](#змінні-середовища)
- [Налаштування Keycloak](#налаштування-keycloak)
- [Потік автентифікації](#потік-автентифікації)
- [Маршрути](#маршрути)
- [Кабінет пацієнта](#кабінет-пацієнта)
- [Кабінет лікаря](#кабінет-лікаря)
- [Тарифи](#тарифи)
- [Backend і CORS](#backend)

## Вимоги

- Для локальних команд використовуйте Node.js `>=24.15.0 <25`. Цей діапазон відповідає
  налаштуванням CI та вимогам зафіксованих версій Vitest і jsdom.
- Для роботи застосунку потрібні Keycloak із realm `rehab-ai` (http://localhost:8081 у Docker-стеку)
  та FastAPI (http://localhost:8001 у Docker-стеку).

Найпростіший спосіб підняти все разом — `docker compose up --build -d` з кореня
репозиторію (див. [`../README.md`](../README.md)).
Для запуску Vite на хості з API у Compose налаштуйте [CORS](#backend).

## Команди

```bash
cd frontend
npm ci
npm run dev          # http://localhost:5173
npm run typecheck    # tsc -b
npm run lint         # oxlint
npm run format:check # prettier --check src
npm run build        # tsc -b && vite build
npm run preview      # http://localhost:4173
npm run test         # одноразовий запуск UI-тестів
npm run test:watch   # інтерактивний режим тестів
```

> У Windows PowerShell, якщо `npm` блокується політикою виконання, використовуйте `npm.cmd`.

## Тести

Тести написані на Vitest та React Testing Library й лежать в
[`src/test/patient-pages.test.tsx`](src/test/patient-pages.test.tsx). Вони перевіряють:

- вхід, реєстрацію та вибір ролі, активацію ролі лікаря після реєстрації, помилки Keycloak;
- доступ за роллю та перенаправлення;
- кабінет пацієнта: запрошення, виконання вправ, запитання лікарю;
- кабінет лікаря: список пацієнтів, архівування й відновлення, призначення;
- сторінку тарифів (без входу, купівля для лікаря) і повідомлення про ліміт пацієнтів.

Keycloak і API підмінені, тому для запуску тестів не потрібно стартувати Docker, backend чи
Keycloak.

```bash
cd frontend
npm ci
npm test
```

Для запуску одного набору тестів:

```bash
npm test -- src/test/patient-pages.test.tsx
```

### Запуск через Docker

З кореня репозиторію виконайте:

```powershell
docker compose --profile test run --build --rm frontend-test
```

Docker збере окремий тестовий образ і запустить тести в контейнері. Backend, Keycloak
та інші сервіси запускати не потрібно; `--rm` видалить контейнер після завершення.
Щоб передати Vitest параметри, наприклад запустити один файл:

```powershell
docker compose --profile test run --build --rm frontend-test npm run test -- src/test/patient-pages.test.tsx
```

У Windows PowerShell замініть `npm` на `npm.cmd`, якщо цього вимагає політика виконання.

## Змінні середовища

Значення за замовчуванням збігаються з адресами сервісів Docker Compose на хості.
Щоб указати власні адреси або параметри Keycloak, скопіюйте [`.env.example`](.env.example)
у `frontend/.env` та змініть потрібні значення.

```dotenv
VITE_KEYCLOAK_URL=http://localhost:8081
VITE_KEYCLOAK_REALM=rehab-ai
VITE_KEYCLOAK_CLIENT_ID=rehab-ai-web
VITE_API_BASE_URL=http://localhost:8001
```

| Змінна                    | Призначення            |
| ------------------------- | ---------------------- |
| `VITE_KEYCLOAK_URL`        | Базова адреса Keycloak |
| `VITE_KEYCLOAK_REALM`      | Назва realm            |
| `VITE_KEYCLOAK_CLIENT_ID`  | Публічний web-клієнт   |
| `VITE_API_BASE_URL`        | Базова адреса FastAPI  |

Vite читає ці значення під час запуску dev-сервера та вбудовує їх у збірку.
Для збірки через Compose адреси задаються в кореневому `.env` через `KEYCLOAK_PUBLIC_URL`
і `VITE_API_BASE_URL`. Після зміни адрес перебудуйте образ фронтенду.

## Налаштування Keycloak

Клієнт `rehab-ai-web` уже описаний у [`keycloak/realm-export.json`](../keycloak/realm-export.json)
і імпортується автоматично Docker Compose. Для ручного налаштування в Admin Console
(`http://localhost:8081/admin`, realm `rehab-ai`):

1. **Clients → Create client**
   - Client ID: `rehab-ai-web`
   - Client type: `OpenID Connect`
   - Client authentication: `Off`
2. **Login settings**
   - Standard flow: `On`
   - Direct access grants: `Off`
   - Implicit flow: `Off`
   - Valid redirect URIs:
     - `http://localhost:3000/*`
     - `http://127.0.0.1:3000/*`
     - `http://localhost:5173/*` (Vite dev)
     - `http://127.0.0.1:5173/*` (Vite dev)
     - `http://localhost:4173/*` (preview)
     - `http://127.0.0.1:4173/*` (preview)
   - Valid post logout redirect URIs: `+`
   - Web origins: `+`
3. **Advanced → Proof Key for Code Exchange Code Challenge Method**: `S256`
4. **Client scopes → Add mapper → By configuration → Audience**
   - Name: `rehab-ai-backend audience`
   - Included client audience: `rehab-ai-backend`
   - Add to access token: `On`

Мапер audience обов'язковий: backend перевіряє `aud` проти `KEYCLOAK_AUDIENCE=rehab-ai-backend`
і без нього `GET /api/v1/auth/me` повертає `401`.

Мобільний клієнт `rehab-ai-mobile` не змінюється — web-клієнт є окремим.

## Потік автентифікації

- `keycloak-js` ініціалізується з `onLoad: 'check-sso'`, `pkceMethod: 'S256'`
  та `silentCheckSsoRedirectUri` (`public/silent-check-sso.html`).
- Вхід: `keycloak.login()`; реєстрація: `keycloak.login({ prompt: 'create' })`.
- На сторінці `/register` можна обрати роль «Пацієнт» або «Лікар». Вибір лікаря
  зберігається як намір у `sessionStorage`. Після реєстрації профіль викликає
  `POST /api/v1/auth/me/role`: backend одразу призначає роль у Keycloak без підтвердження,
  а застосунок примусово оновлює токен (`updateToken(-1)`), щоб він містив нову роль. Якщо
  активація не вдалась, профіль показує помилку з кнопкою «Спробувати ще раз».
- Пароль вводиться лише на сторінці Keycloak і ніколи не потрапляє до AIRehab.
- Токен доступу зберігається лише в пам'яті (не в `localStorage`/`sessionStorage`)
  і оновлюється через `updateToken` перед запитами до API.
- Профіль, меню й захищені маршрути беруть роль і статус облікового запису зі спільного
  запиту `GET /api/v1/auth/me`. Якщо адміністратор змінить роль у Keycloak, потрібен
  новий токен: оновіть профіль або увійдіть знову.
- Вихід: `keycloak.logout()` із поверненням на головну сторінку.

## Маршрути

| Шлях | Хто бачить | Опис |
| --- | --- | --- |
| `/` | усі | Головна сторінка; авторизованих перенаправляє на `/profile` |
| `/login` | усі | Вхід через Keycloak |
| `/register` | усі | Реєстрація через Keycloak (`prompt=create`) із вибором ролі |
| `/pricing` | усі, без входу | Тарифи для лікарів; лікар може змінити тариф |
| `/profile` | авторизовані | Профіль (потребує активної сесії) |
| `/patient` | пацієнт | Кабінет пацієнта |
| `/patient/therapists` | пацієнт | Лікарі пацієнта |
| `/patient/invitations` | пацієнт | Запрошення: прийняти або відхилити |
| `/patient/exercises` | пацієнт | Розклад, призначення й виконані сесії |
| `/patient/exercises/:assignmentId/execute` | пацієнт | Виконання призначення, аналіз відео або сесія без відео |
| `/therapist`, `/therapist/patients` | лікар, адмін | Активні пацієнти, архів, нове запрошення, тариф |
| `/therapist/patients/:patientId` | лікар, адмін | Профіль пацієнта: призначення, запитання, історія, архівування |
| `/therapist/exercises` | лікар, адмін | Бібліотека вправ з еталонними відео |
| `/therapist/questions` | лікар, адмін | Запитання пацієнтів без відповіді |
| `/error` | усі | Сторінка помилок авторизації |
| `*` | усі | Сторінка «Сторінку не знайдено» |

## Кабінет пацієнта

Кабінет завантажує запрошення, список терапевтів, призначення, історію виконання та
запитання до терапевта через API. Статус запрошення й виконані сесії зберігає backend.

Під час виконання вправи пацієнт може завантажити відео MP4 або MOV розміром до 100 МБ.
Фронтенд надсилає файл до S3-сумісного сховища за адресою від API та запитує фоновий
аналіз за еталонним відео вправи. Після успішного аналізу backend зберігає сесію з
результатом. Сесію також можна завершити без відео.

## Кабінет лікаря

Кабінет лікаря (`/therapist/*`) доступний ролям «лікар» і «адмін». Спільні дані (пацієнти,
архів, тариф, вправи) кешуються в `TherapistWorkspaceLayout` і оновлюються при поверненні
на сторінку.

- **Пацієнти.** Список активних пацієнтів, картка тарифу («активних 3 з 5, вільно 2»,
  очікувані запрошення займають місце) і форма запрошення за email пацієнта. Розділ «Архів»
  показує заархівованих пацієнтів із кнопкою «Відновити».
- **Профіль пацієнта.** Призначення плану (вправа, тижні, дні, повторення, дата початку),
  скасування призначень, запитання пацієнта й відповіді, історія виконання (біль,
  регулярність, оцінка техніки). Кнопка «Архівувати пацієнта» скасовує активні призначення
  лікаря для цього пацієнта; в архіві профіль доступний лише для читання, а форма
  призначення замінена повідомленням.
- **Вправи.** Бібліотека вправ: назва, опис, еталонне відео та частини тіла для аналізу. Допуски кутів форма не змінює, їх задають через API.
- **Запитання.** Усі запитання пацієнтів без відповіді; кількість показується біля пункту
  меню «Запитання».

Коли backend повертає `409` із кодом `patient_limit_reached`, `ApiError.code` містить цей
код, а користувач бачить пояснення, що ліміт тарифу вичерпано.

## Тарифи

Сторінка `/pricing` публічна: завантажує тарифи з `GET /api/v1/plans/` без токена
(`apiRequest` з `authenticated: false`). Незалогінений відвідувач бачить «Увійти, щоб обрати»,
лікар — свій поточний тариф і кнопки для інших тарифів, пацієнт кнопок не бачить. Оплата
тестова: тариф активується одразу, кошти не списуються. Посилання на сторінку є у футері та
в картці тарифу кабінету лікаря.

## Backend

Backend має дозволяти адресу фронтенду в `CORS_ORIGINS`. Compose за замовчуванням
дозволяє `http://localhost:3000`. Для Vite на хості створіть кореневий `.env` із
[`../.env.example`](../.env.example), якщо його ще немає. Додайте до списку
`CORS_ORIGINS` адресу `http://localhost:5173` (або `http://localhost:4173` для preview)
і застосуйте зміни командою `docker compose up -d backend`.
Для запуску backend поза Compose див. [`backend/.env.example`](../backend/.env.example).
Запити до API авторизуються заголовком `Authorization: Bearer …`.
