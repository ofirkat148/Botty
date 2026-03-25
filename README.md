# Botty Local OSS Runtime

Botty is a local Postgres-backed app with a React frontend, a Node/Express API, local JWT auth, and direct provider calls such as Claude via Anthropic.

## Project Structure

- `src/` contains the Vite React client
- `server/` contains the Express API, database code, auth, and provider integrations
- root config files stay at the repository root for Docker, Vite, TypeScript, and Drizzle

## Run Locally

- Node.js 20+
- PostgreSQL 16+ or Docker Compose

1. Copy `.env.example` to `.env.local`
2. Set `JWT_SECRET`, `DATABASE_URL`, and at least one provider key such as `ANTHROPIC_API_KEY`
3. Start PostgreSQL with `docker compose up -d postgres` or use an existing local Postgres instance
4. Run `npm install`
5. Run `npm run dev`

The frontend runs on `http://localhost:5173` and the API runs on `http://localhost:5000`.

## Local Auth

The app uses local email-based sign-in for single-user development. Enter any valid email in the UI and Botty will create or reuse that identity in PostgreSQL.

## Claude

If `ANTHROPIC_API_KEY` is set, the app will automatically expose Anthropic in the provider list and the default chat path will use Claude.
