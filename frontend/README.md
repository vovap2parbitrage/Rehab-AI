# AIRehab — вебфронтенд

React + TypeScript + Vite застосунок для пацієнтів і терапевтів AIRehab.
Авторизація повністю делегована Keycloak (OpenID Connect, Authorization Code Flow + PKCE),
дані профілю надходять із FastAPI.

## Вимоги

- Node.js 20+ (перевірено на Node 24)
- Запущений Keycloak із realm `rehab-ai` (http://localhost:8080)
- Запущений FastAPI backend (http://localhost:8000)

## Команди

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # tsc -b
npm run lint       # oxlint
npm run build      # tsc -b && vite build
npm run preview    # http://localhost:4173
```

> У Windows PowerShell, якщо `npm` блокується політикою виконання, використовуйте `npm.cmd`.

## Змінні середовища

Створіть `frontend/.env` (усі значення мають робочі типові значення за замовчуванням):

```dotenv
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_REALM=rehab-ai
VITE_KEYCLOAK_CLIENT_ID=rehab-ai-web
VITE_API_BASE_URL=http://localhost:8000
```

| Змінна | Призначення |
| --- | --- |
| `VITE_KEYCLOAK_URL` | Базова адреса Keycloak |
| `VITE_KEYCLOAK_REALM` | Назва realm |
| `VITE_KEYCLOAK_CLIENT_ID` | Публічний web-клієнт |
| `VITE_API_BASE_URL` | Базова адреса FastAPI |

Vite вбудовує ці значення під час збірки, тому для кожного середовища потрібна окрема збірка.

## Налаштування Keycloak

Клієнт `rehab-ai-web` уже описаний у `keycloak-realm-config.json`. Його можна створити
вручну в Admin Console (`http://localhost:8080/admin`, realm `rehab-ai`):

1. **Clients → Create client**
   - Client ID: `rehab-ai-web`
   - Client type: `OpenID Connect`
   - Client authentication: `Off`
2. **Login settings**
   - Standard flow: `On`
   - Direct access grants: `Off`
   - Implicit flow: `Off`
   - Valid redirect URIs:
     - `http://localhost:5173/*`
     - `http://127.0.0.1:5173/*`
     - `http://localhost:4173/*`
     - `http://127.0.0.1:4173/*` (і `preview`)
   - Valid post logout redirect URIs: `+`
   - Web origins: `http://localhost:5173`, `http://127.0.0.1:5173`,
     `http://localhost:4173`, `http://127.0.0.1:4173`
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
- Роль та статус облікового запису завжди беруться з `GET /api/v1/auth/me`,
  а не з даних браузера.
- Вихід: `keycloak.logout()` із поверненням на головну сторінку.

## Маршрути

| Шлях | Опис |
| --- | --- |
| `/` | Головна сторінка |
| `/login` | Вхід через Keycloak |
| `/register` | Реєстрація через Keycloak (`prompt=create`) із вибором ролі |
| `/profile` | Захищений профіль (потребує активної сесії) |
| `/error` | Сторінка помилок авторизації |
| `*` | Сторінка «Сторінку не знайдено» |

## Backend

Застосунок звертається до API з іншого origin, тому backend має дозволяти CORS для
`http://localhost:5173` і `http://localhost:4173` (див. `CORS_ORIGINS` у `backend/.env.example`).
Авторизація використовує заголовок `Authorization: Bearer …`, cookie не застосовуються.

## Відомі обмеження

- Frontend не має власного стану ролей: після зміни ролі в Keycloak потрібно оновити
  профіль або повторно увійти, щоб отримати новий токен.
- Використано лише наявні endpoint'и backend; нові API не створювалися.
- Автоматизованих UI-тестів (Playwright/Vitest) поки немає — перевірено вручну в браузері.
