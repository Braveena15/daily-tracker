# Daily Tracker

A personal web app for tracking mood, meals, weight, learning and reflection every day, with AI encouragement along the way.

## Features

| Status | Feature |
| ------ | ------- |
| ✅ | Project setup: React client, Express API, MongoDB Atlas connection, health check page |
| ✅ | Login and user accounts (bcrypt passwords, JWT in an httpOnly cookie, protected routes) |
| ✅ | Profile with BMR, TDEE, daily calorie target (with a safe minimum), BMI and weeks-to-goal |
| ✅ | Today as a timeline: quick mood check-ins, workouts, mental and outdoor activities, good things, learnings and present moments, each with its own time; body values; intraday mood and step graphs |
| ✅ | 30-day history and check-in streaks |
| ✅ | Meal and calorie logging against the daily target |
| ✅ | Daily mental, physical and learning scores |
| ✅ | Weight trend chart with a 7-day moving average |
| ✅ | Encrypted diary |
| ✅ | CBT-style thought log |
| ✅ | Gemini AI encouragement |
| ✅ | Apple Health sync via iOS Shortcuts, including sleep and a calculated sleep score |
| ✅ | Installable PWA, deployed on Render as one web service |

## Tech stack

- **Frontend:** React, Vite, TypeScript, installable as a PWA (vite-plugin-pwa)
- **Backend:** Express, TypeScript, Mongoose
- **Database:** MongoDB Atlas
- **Hosting:** Render (one web service: Express serves the API and the built client)

## Project structure

```
daily-tracker/
├── package.json         # build and start scripts for production (Render)
├── render.yaml          # Render Blueprint: one web service
├── client/              # React + Vite frontend
│   ├── public/
│   ├── src/
│   │   ├── components/  # shared components, e.g. ProtectedRoute
│   │   ├── context/     # AuthProvider and the useAuth hook
│   │   ├── lib/api.ts   # fetch wrapper for the API
│   │   ├── pages/       # Login, Register, Dashboard
│   │   ├── App.tsx      # routes
│   │   └── main.tsx
│   ├── pwa-assets.config.ts # app icons, made from public/favicon.svg
│   └── vite.config.ts   # proxies /api to the server; PWA manifest and service worker
└── server/              # Express + Mongoose API
    ├── src/
    │   ├── config/      # env validation, MongoDB connection
    │   ├── controllers/ # request handlers
    │   ├── middleware/  # requireAuth, rate limiting, error handling
    │   ├── models/      # Mongoose models
    │   ├── routes/      # /api/health, /api/auth
    │   ├── types/       # Express type extensions
    │   ├── utils/       # JWT and cookie helpers, AppError
    │   ├── app.ts       # Express app setup
    │   └── index.ts     # entry point
    └── .env.example     # template for environment variables
```

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 22.12 or later, with npm
- A [MongoDB Atlas](https://www.mongodb.com/atlas) cluster (the free tier works) and its connection string

### Install

```bash
git clone https://github.com/<your-username>/daily-tracker.git
cd daily-tracker

cd server && npm install
cd ../client && npm install
```

### Configure environment variables

Copy the example file and fill in your own values:

```bash
cp server/.env.example server/.env
```

| Variable | Description |
| -------- | ----------- |
| `PORT` | Port for the Express server (default `4000`; Render sets it) |
| `NODE_ENV` | `development` or `production`. In production the server also serves the client, cookies are HTTPS-only and errors hide details. |
| `MONGODB_URI` | Your MongoDB Atlas connection string |
| `JWT_SECRET` | A random string of at least 32 characters, used to sign login tokens |
| `DIARY_ENCRYPTION_KEY` | Exactly 64 hex characters; encrypts diary and thought-log text. Back it up: if it's lost, that text can't be read. |
| `ALLOW_REGISTRATION` | `true` to allow new sign-ups. Anything else closes registration. |
| `CLIENT_URL` | Development only: the Vite dev server, allowed by CORS (e.g. `http://localhost:5173`) |
| `GEMINI_API_KEY` | Google AI Studio key for AI encouragement. Optional in development (pre-written messages instead), required in production. |
| `GEMINI_MODEL` | Gemini model, e.g. `gemini-2.5-flash`. Required in production. |
| `AI_DATA_MODE` | `minimal` (numbers and categories only) or `full` (thought-log text too, never private logs or the diary). Required in production. |
| `AI_DAILY_LIMIT` | AI calls per user per day (default `20`) |

The server checks these at startup and stops with a clear message if any are missing or invalid.

`server/.env` is git-ignored. Never commit real credentials.

### Run

Start each server in its own terminal:

```bash
# Terminal 1: API on http://localhost:4000
cd server
npm run dev
```

```bash
# Terminal 2: client on http://localhost:5173
cd client
npm run dev
```

Open http://localhost:5173 and create an account, or log in. Vite forwards every `/api` request to the server. You can check the server and database at http://localhost:4000/api/health.

### API

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/health` | Server and database status |
| POST | `/api/auth/register` | Create an account (only when `ALLOW_REGISTRATION=true`) |
| POST | `/api/auth/login` | Log in; sets the `token` cookie (10 attempts per 15 minutes) |
| POST | `/api/auth/logout` | Clear the `token` cookie |
| GET | `/api/auth/me` | Current user (requires login) |
| GET | `/api/profile` | Profile fields (requires login) |
| PUT | `/api/profile` | Update profile fields; `null` clears a field (requires login) |
| GET | `/api/profile/summary` | Age, BMR, TDEE, calorie target, BMI and weeks to goal, or which fields are missing (requires login) |
| GET | `/api/entries?from=&to=` | Entries in a date range, newest first (default: last 30 days, max 366) |
| GET | `/api/entries/today` | Today's day (Asia/Colombo date), as for `GET /api/entries/:date` |
| GET | `/api/entries/:date` | The day's `entry` (or `null`), a chronological `timeline` of everything logged, and the intraday `healthSnapshots` |
| PUT | `/api/entries/:date/daily` | Set `weightKg`, `steps`, `activeCalories` by hand (always replaces; `null` clears) |
| POST | `/api/entries/:date/:kind` | Add one entry; optional `time` ("HH:mm") back-fills it to earlier that day |
| PATCH | `/api/entries/:date/:kind/:id` | Change some fields of one entry (`null` clears an optional field) |
| DELETE | `/api/entries/:date/:kind/:id` | Delete one entry |
| DELETE | `/api/entries/:date` | Delete the whole day |
| GET | `/api/entries/stats/streak` | Current and longest logging streak |

`kind` is `moods`, `workouts`, `mental`, `outdoor`, `goodThings`, `learnings` or `presentMoments`. Every entry has its own `id` and a `loggedAt` time. Future dates and times are rejected. Workouts from Apple Watch are replaced by each sync, so they can't be edited by hand.

All `/api/entries` routes require login and only ever return the logged-in user's own entries.

#### Steps and active calories only go up

A day's totals only grow, so an Apple Health sync replaces `steps` or `activeCalories` only when the new number is **higher** than what's stored (a lower one is reported back as `keptFields`). Each sync that changes them also adds a `{ time, steps, activeCalories }` point to `healthSnapshots` for the "through the day" chart. Typing a value on the Today page always replaces it, so a wrong number can be fixed.

### Migrating older data

Data saved before the timeline model (one mood per day, a single present moment, good things as plain text) is converted with:

```bash
cd server
npm run migrate:timeline -- --dry-run   # only count what would change
npm run migrate:timeline                # convert
```

It's safe to run twice: days already converted are left alone.

### Tests

```bash
cd server
npm test
```

Unit tests (Vitest) cover the calculations, scores, sleep, validation, AI privacy rules, Apple Health merging, environment checks and how production serves the client.

## Deploying to Render

The app runs as **one web service**. In production (`NODE_ENV=production`) Express serves the built client from `client/dist`, sends `index.html` for every page outside `/api`, and keeps the API under `/api`. The app and the API share one address, so no CORS setup is needed.

### Try a production build locally

```bash
npm run build                       # installs and builds the client and the server
NODE_ENV=production PORT=4100 npm start
```

On Windows PowerShell: `$env:NODE_ENV="production"; $env:PORT="4100"; npm start`

Open http://localhost:4100. The server reads `server/.env`; in production mode it also needs `GEMINI_API_KEY`, `GEMINI_MODEL` and `AI_DATA_MODE`.

> If MongoDB reports `querySrv ECONNREFUSED` locally: the public-DNS workaround for `mongodb+srv://` only runs in development, and some home networks block those lookups. It works on Render.

### Deploy

1. Push the repo to GitHub.
2. In [MongoDB Atlas](https://cloud.mongodb.com/) → **Network Access**, allow `0.0.0.0/0`. Render's free plan has no fixed IP address, so a strong database password is your protection.
3. On [Render](https://dashboard.render.com/): **New → Blueprint**, then pick the repo. Render reads `render.yaml`: a Node web service in Singapore on the free plan, built with `npm run build`, started with `npm start`, with `/api/health` as the health check.
4. Render asks for each environment variable marked `sync: false`; fill them in (see the table above). Use **new** random values for `JWT_SECRET`. Use the **same** `DIARY_ENCRYPTION_KEY` as before if the database already has diary entries.
5. Wait for the first deploy, then open `https://<your-service>.onrender.com`.
   If the database has data from before the timeline model, run `npm run migrate:timeline` against the production database once the new code is live (see [Migrating older data](#migrating-older-data)).
6. Apple Health sync: in the app, open **Profile → Apple Watch sync**, create a token, and point your iOS Shortcut at `https://<your-service>.onrender.com/api/health-sync`.

Every push to the main branch deploys again. The free plan sleeps after about 15 minutes without visits. The first visit after that can take up to a minute, and the app shows a "Waking up the server…" screen meanwhile.

### Install the app on your phone

- **iPhone (Safari):** Share → **Add to Home Screen**.
- **Android (Chrome):** menu → **Install app**.

The service worker caches only the app shell (HTML, JS, CSS, icons and fonts), so the app opens quickly. API responses are never cached: your data always comes fresh from the server. When a new version is deployed, a "New version available" toast offers a **Refresh** button.

To change the icon, edit `client/public/favicon.svg` and run `npm run generate-pwa-assets` in `client/`.

## Roadmap

1. ✅ **Part 1:** Project setup, MongoDB connection, health check page
2. ✅ **Part 2:** Login and user accounts
3. ✅ **Part 3:** Profile and BMR/TDEE/calorie target calculations
4. ✅ **Part 4:** Daily check-in, history and streaks
5. ✅ **Part 5:** Meal and calorie logging, and daily mental, physical and learning scores
6. ✅ **Part 6:** Weight trend with 7-day average
7. ✅ **Part 7:** Diary and CBT-style thought log
8. ✅ **Part 8:** Gemini AI encouragement
9. ✅ **Part 9:** Apple Health sync via iOS Shortcuts
10. ✅ **Part 10:** PWA support and deployment on Render

## License

Released under the [MIT License](LICENSE).
