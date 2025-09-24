Railway Deployment Guide
=======================

This file explains the minimal steps to deploy the `backend` on Railway.

1. Create a new Railway project and connect your GitHub repository (or push from local).
2. Choose the `backend` folder as the project root (set "Start Directory" to `backend`).
3. Railway will detect a Node.js app. If needed, set the `Start Command` to `npm start`.
4. Set the `PORT` environment variable to the Railway-provided `PORT` (Railway sets it automatically).
5. Add required environment variables in Railway Settings > Variables (see `.env.example`). Important ones:
   - `MONGO_URI` (MongoDB Atlas connection string)
   - `JWT_SECRET`
   - `RESEND_API_KEY` (or alternative email provider keys)
   - `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` (if using queues)
   - `CLOUDINARY_*` keys (if using file uploads)
   - `FRONTEND_URL`, `BACKEND_URL`

Health Check
------------
Railway can use the `/api/status` endpoint for health checks. It returns HTTP 200 when the app is running.

Notes
-----
- Keep secrets out of source control; use Railway environment variables.
- If using Redis with TLS (Redis Cloud/Upstash), set `REDIS_TLS_ENABLED=true`.
- If your app needs a specific Node version, set `engines.node` in `package.json` (already set to `20.x`).
