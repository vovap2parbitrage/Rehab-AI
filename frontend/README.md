# AIRehab — вебфронтенд

React + TypeScript + Vite застосунок для пацієнтів і терапевтів AIRehab.
Авторизація повністю делегована Keycloak (OpenID Connect, Authorization Code Flow + PKCE),
дані профілю й кабінетів надходять із FastAPI.

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

## Автоматизовані тести сторінок пацієнта

Тести Login, Register і кабінету пацієнта написані на Vitest та React Testing Library.
Вони перевіряють перенаправлення, вибір ролі, помилки Keycloak, доступ за роллю,
запрошення, список і виконання вправ та запитання лікарю. Keycloak і API підмінені,
тому для запуску тестів не потрібно стартувати Docker, backend чи Keycloak.

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
Тестовий файл: [`src/test/patient-pages.test.tsx`](src/test/patient-pages.test.tsx).

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
  зберігається лише як намір у `sessionStorage` (не роль) і після реєстрації
  автоматично перетворюється на запит `POST /api/v1/auth/role-requests`.
  Остаточну роль лікаря призначає адміністратор у Keycloak.
- Пароль вводиться лише на сторінці Keycloak і ніколи не потрапляє до AIRehab.
- Токен доступу зберігається лише в пам'яті (не в `localStorage`/`sessionStorage`)
  і оновлюється через `updateToken` перед запитами до API.
- Профіль, меню й захищені маршрути беруть роль і статус облікового запису зі спільного
  запиту `GET /api/v1/auth/me`. Після зміни ролі в Keycloak може знадобитися повторний
  вхід, щоб отримати токен з оновленою роллю.
- Вихід: `keycloak.logout()` із поверненням на головну сторінку.

## Маршрути

| Шлях                                       | Опис                                                        |
| ------------------------------------------ | ----------------------------------------------------------- |
| `/`                                        | Головна сторінка                                            |
| `/login`                                   | Вхід через Keycloak                                         |
| `/register`                                | Реєстрація через Keycloak (`prompt=create`) із вибором ролі   |
| `/profile`                                 | Захищений профіль (потребує активної сесії)                   |
| `/patient`                                 | Кабінет пацієнта                                            |
| `/patient/therapists`                      | Список терапевтів пацієнта                                   |
| `/patient/invitations`                     | Перегляд запрошень та прийняття або відхилення               |
| `/patient/exercises`                       | Розклад, призначення й виконані сесії                        |
| `/patient/exercises/:assignmentId/execute` | Виконання призначення, аналіз відео або сесія без відео        |
| `/error`                                   | Сторінка помилок авторизації                                 |
| `*`                                        | Сторінка «Сторінку не знайдено»                               |

## Кабінет пацієнта

Кабінет завантажує запрошення, список терапевтів, призначення, історію виконання та
запитання до терапевта через API. Статус запрошення й виконані сесії зберігає backend.

Під час виконання вправи пацієнт може завантажити відео MP4 або MOV розміром до 100 МБ.
Фронтенд надсилає файл до S3-сумісного сховища за адресою від API та запитує фоновий
аналіз за еталонним відео вправи. Після успішного аналізу backend зберігає сесію з
результатом. Сесію також можна завершити без відео.

## Backend

Backend має дозволяти адресу фронтенду в `CORS_ORIGINS`. Compose за замовчуванням
дозволяє `http://localhost:3000`. Для Vite на хості створіть кореневий `.env` із
[`../.env.example`](../.env.example), якщо його ще немає. Додайте до списку
`CORS_ORIGINS` адресу `http://localhost:5173` (або `http://localhost:4173` для preview)
і застосуйте зміни командою `docker compose up -d backend`.
Для запуску backend поза Compose див. [`backend/.env.example`](../backend/.env.example).
Запити до API авторизуються заголовком `Authorization: Bearer …`.
