# Deploying Heavenly to Render — one service, no separate frontend host

Everything lives in one Render **Web Service**: the Discord bot runs on
the main thread, Flask serves both the API *and* the built React
dashboard on the same port. Render builds the frontend for you — you
never run `npm install` yourself.

## 1. Repo layout

Commit this structure:
```
your-repo/
├── main-5.py
├── dashboard.py
├── requirements.txt
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    ├── public/
    │   └── heavenly-avatar.jpg
    └── src/
        ├── main.jsx
        ├── App.jsx
        └── index.css
```
(All of these files were generated for you — just upload them into that
layout on GitHub. GitHub's web upload preserves folders if you drag a
whole folder in, or create `frontend/src/App.jsx` etc. one at a time via
"Add file" -> "Create new file" and paste each one in.)

## 2. Create the Web Service

- Render -> New -> Web Service -> connect your repo
- **Build command:**
  ```
  pip install -r requirements.txt && cd frontend && npm install && npm run build
  ```
- **Start command:**
  ```
  python main-5.py
  ```
- Instance type: Starter is fine to begin with

## 3. Environment variables

Set everything from `.env.example` in Render's Environment tab (Render
injects `PORT` itself — don't set it manually):

| Var | Value |
|---|---|
| `DISCORD_TOKEN` | your bot token |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | from the OAuth2 tab of your Discord app |
| `DISCORD_REDIRECT_URI` | `https://<your-render-service>.onrender.com/callback` |
| `FLASK_SECRET_KEY` | a long random string |
| `BOT_DB_PATH` | `/var/data/bot.db` (see disk step below) |

## 4. Add a Discord redirect URI

Discord Developer Portal -> your app -> OAuth2 -> Redirects -> add exactly
the URL you put in `DISCORD_REDIRECT_URI`. Mismatches are the #1 cause
of login failing.

## 5. Persist the database

Render's filesystem is **ephemeral** — every deploy wipes it, which
would wipe `bot.db`. Render -> your service -> Disks -> Add Disk, mount at
`/var/data`, set `BOT_DB_PATH=/var/data/bot.db`. Works fine on a single
instance, which is what you want anyway (the bot can only run one
instance at a time).

## 6. Deploy and test

Push to your connected branch — Render builds and deploys automatically.
Once live, visit `https://<your-service>.onrender.com` -> **Sign in with
Discord** -> approve -> you land back on the dashboard with your
manageable servers listed.

## Updating the dashboard later

Since the frontend is just files in `frontend/src/`, editing
`App.jsx` and pushing to GitHub triggers a fresh Render build — no
separate frontend deploy step, ever.

## If Render's build image doesn't have Node

Almost all Render Python environments include Node/npm already, but if
the build fails with "npm: command not found", switch the service's
runtime to **Docker** and use a two-stage Dockerfile (Node stage builds
`frontend/dist`, Python stage runs the bot) — ask if you want that file
generated.
