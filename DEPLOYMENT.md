# Deployment Guide

## Stack
- **Backend** → [Railway](https://railway.app) (Flask + Gunicorn)
- **Frontend** → [Vercel](https://vercel.com) (React static build)

---

## Backend — Railway

1. Create a new Railway project and link this repo
2. Railway auto-detects `railway.toml` — no extra config needed
3. Set the following environment variables in Railway dashboard:

| Variable | Value |
|---|---|
| `FLASK_DEBUG` | `false` |
| `CORS_ORIGINS` | your Vercel frontend URL, e.g. `https://reviewlens.vercel.app` |
| `MAX_UPLOAD_MB` | `50` |
| `MAX_UPLOAD_FILES` | `50` |
| `MAX_EXPORT_FILES` | `200` |
| `MAX_PROJECT_FILES` | `50` |
| `STORAGE_MAX_AGE_HOURS` | `168` |

4. Note the Railway service URL (e.g. `https://reviewlens-api.up.railway.app`) — you'll need it for the frontend

---

## Frontend — Vercel

1. Import the repo into Vercel, set **Root Directory** to `frontend`
2. Vercel auto-detects `vercel.json` in the `frontend/` folder
3. Set the following environment variable in Vercel dashboard:

| Variable | Value |
|---|---|
| `REACT_APP_API_URL` | your Railway backend URL (from step above) |

4. Deploy — Vercel will run `npm run build` and serve `build/`

---

## Notes

- `jobs.db` (SQLite job store) is created automatically in `backend/` on first startup
- Railway provides a persistent filesystem volume — jobs survive redeploys
- The `Procfile` and `render.yaml` are kept for reference but are no longer the active deployment target
