# lms-backend

Node.js + Express + PostgreSQL backend for the LMS.

## Stack

- **Runtime:** Node.js (CommonJS)
- **Framework:** Express
- **DB:** PostgreSQL via `pg` (connection pool)
- **Auth:** JWT (access 15m + refresh 7d) in httpOnly cookies
- **Validation:** Zod
- **Hashing:** bcryptjs

## Setup

```bash
# 1. install
npm install

# 2. env (app loads `.env.prod` only)
cp .env.prod.example .env.prod   # then fill in DATABASE_URL + JWT secrets

# 3. run
npm run dev            # nodemon, auto-reload
npm start              # plain node
```

## Project structure

```
src/
├── app.js                          # express setup, cors, cookies, error handler, health check
├── config/
│   ├── env.js                      # validates + exports env vars (exits if missing)
│   └── db.js                       # pg Pool, query(), getClient() for transactions
├── middleware/
│   ├── auth.middleware.js          # authenticate (JWT) + authorize(...roles)
│   ├── validate.middleware.js      # Zod request validator
│   └── error.middleware.js         # 404 + centralized error handler
├── modules/                        # feature modules (per phase)
│   └── .gitkeep
└── utils/
    ├── jwt.utils.js                # signAccessToken / signRefreshToken / verifyToken
    ├── hash.utils.js               # hashPassword / comparePassword
    └── response.utils.js           # { success, data, message, errors } helpers + ApiError
```

## Standard API response

All endpoints return:

```json
{
  "success": true,
  "data": { },
  "message": "OK",
  "errors": null
}
```

On error:

```json
{
  "success": false,
  "data": null,
  "message": "Validation failed",
  "errors": [{ "path": "email", "message": "Invalid email", "code": "invalid_string" }]
}
```

## Environment variables

| Key                       | Example                                  |
|---------------------------|------------------------------------------|
| `PORT`                    | `8080`                                   |
| `NODE_ENV`                | `development` \| `production`            |
| `DATABASE_URL`            | `postgres://user:pass@localhost:5432/lms`|
| `JWT_ACCESS_SECRET`       | long random string                       |
| `JWT_REFRESH_SECRET`      | long random string                       |
| `JWT_ACCESS_EXPIRES_IN`   | `15m`                                    |
| `JWT_REFRESH_EXPIRES_IN`  | `7d`                                     |
| `FRONTEND_URL`            | `http://localhost:3000`                  |

## Adding a feature module

```
src/modules/<feature>/
├── <feature>.routes.js
├── <feature>.controller.js
├── <feature>.service.js
└── <feature>.schema.js   # Zod schemas
```

Mount it in `src/app.js`:

```js
app.use('/api/<feature>', require('./modules/<feature>/<feature>.routes'));
```

## Health check

`GET /health` → checks DB connectivity and returns uptime.
