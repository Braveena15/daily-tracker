# Daily Tracker

A personal web app for tracking mood, meals, weight, learning and reflection every day, with AI encouragement along the way.

## Features

| Status | Feature |
| ------ | ------- |
| ✅ | Project setup: React client, Express API, MongoDB Atlas connection, health check page |
| 🚧 | Login and user accounts |
| 🚧 | Daily check-in: mood, weight, activities, learnings |
| 🚧 | Meal and calorie logging with BMR/TDEE estimates |
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
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── vite.config.ts   # proxies /api to the server on port 4000
└── server/              # Express + Mongoose API
    ├── src/
    │   └── index.ts     # app entry, MongoDB connection, /api/health
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
| `MONGODB_URI` | Your MongoDB Atlas connection string |

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

Open http://localhost:5173. The page calls `/api/health`, which Vite forwards to the server, and shows whether the server and database are connected.

## Roadmap

1. ✅ **Part 1:** Project setup, MongoDB connection, health check page
2. 🚧 **Part 2:** Login and user accounts
3. 🚧 **Part 3:** Daily check-in (mood, weight, activities, learnings)
4. 🚧 **Part 4:** Meal and calorie logging with BMR/TDEE
5. 🚧 **Part 5:** Daily mental, physical and learning scores
6. 🚧 **Part 6:** Weight trend with 7-day average
7. 🚧 **Part 7:** Diary and CBT-style thought log
8. 🚧 **Part 8:** Gemini AI encouragement
9. 🚧 **Part 9:** Apple Health sync via iOS Shortcuts
10. 🚧 **Part 10:** PWA support and deployment

## License

Released under the [MIT License](LICENSE).
