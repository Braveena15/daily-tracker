# Daily Tracker

A personal web app for tracking mood, meals, weight, learning and reflection every day, with AI encouragement along the way.

## Features

| Status | Feature |
| ------ | ------- |
| ✅ | Project setup: React client, Express API, MongoDB Atlas connection, health check page |
| ✅ | Login and user accounts (bcrypt passwords, JWT in an httpOnly cookie, protected routes) |
| ✅ | Profile with BMR, TDEE, daily calorie target (with a safe minimum), BMI and weeks-to-goal |
| ✅ | Daily check-in: mood, energy, sleep, body, workouts, mental and outdoor activities, good things, learnings |
| ✅ | 30-day history and check-in streaks |
| 🚧 | Meal and calorie logging against the daily target |
| 🚧 | Daily mental, physical and learning scores |
| 🚧 | Weight trend chart with a 7-day moving average |
| 🚧 | Diary |
| 🚧 | CBT-style thought log |
| 🚧 | Gemini AI encouragement |
| 🚧 | Apple Health sync via iOS Shortcuts |
| 🚧 | Installable PWA |

## Tech stack

- **Frontend:** React, Vite, TypeScript
- **Backend:** Express, TypeScript, Mongoose
- **Database:** MongoDB Atlas

## Project structure

```
daily-tracker/
├── client/              # React + Vite frontend
│   ├── public/
│   ├── src/
│   │   ├── components/  # shared components, e.g. ProtectedRoute
│   │   ├── context/     # AuthProvider and the useAuth hook
│   │   ├── lib/api.ts   # fetch wrapper for the API
│   │   ├── pages/       # Login, Register, Dashboard
│   │   ├── App.tsx      # routes
│   │   └── main.tsx
│   └── vite.config.ts   # proxies /api to the server on port 4000
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

- [Node.js](https://nodejs.org/) 20 or later, with npm
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
| `PORT` | Port for the Express server (default `4000`) |
| `NODE_ENV` | `development` or `production`. In production, cookies are HTTPS-only and errors hide details. |
| `MONGODB_URI` | Your MongoDB Atlas connection string |
| `JWT_SECRET` | A random string of at least 32 characters, used to sign login tokens |
| `ALLOW_REGISTRATION` | `true` to allow new sign-ups. Anything else closes registration. |
| `CLIENT_URL` | URL of the React client, allowed by CORS (e.g. `http://localhost:5173`) |

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
| GET | `/api/entries/today` | Today's entry (Asia/Colombo date) or `null` |
| GET | `/api/entries/:date` | One day's entry or `null` |
| PUT | `/api/entries/:date` | Create or update a day's entry (no future dates) |
| DELETE | `/api/entries/:date` | Delete a day's entry |
| GET | `/api/entries/stats/streak` | Current and longest check-in streak |

All `/api/entries` routes require login and only ever return the logged-in user's own entries.

### Tests

```bash
cd server
npm test
```

Unit tests (Vitest) cover the calorie and body calculations, the date and streak helpers, and the check-in validation.

## Roadmap

1. ✅ **Part 1:** Project setup, MongoDB connection, health check page
2. ✅ **Part 2:** Login and user accounts
3. ✅ **Part 3:** Profile and BMR/TDEE/calorie target calculations
4. ✅ **Part 4:** Daily check-in, history and streaks
5. 🚧 **Part 5:** Meal and calorie logging, and daily mental, physical and learning scores
6. 🚧 **Part 6:** Weight trend with 7-day average
7. 🚧 **Part 7:** Diary and CBT-style thought log
8. 🚧 **Part 8:** Gemini AI encouragement
9. 🚧 **Part 9:** Apple Health sync via iOS Shortcuts
10. 🚧 **Part 10:** PWA support and deployment

## License

Released under the [MIT License](LICENSE).
