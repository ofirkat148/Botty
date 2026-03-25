# Botty Quick Start

## 1. Configure Environment

```bash
cd /home/ofirkat/Botty/Botty
cp .env.example .env.local
```

Set these values in `.env.local`:

```env
DATABASE_URL=postgresql://botty_user:botty_pass@localhost:5432/botty_db
JWT_SECRET=replace-this
ANTHROPIC_API_KEY=your_claude_key
```

## 2. Start PostgreSQL

```bash
docker compose up -d postgres
```

## 3. Start the App

```bash
npm install
npm run dev
```

## 4. Open the App

- Frontend: `http://localhost:5173`
- API: `http://localhost:5000`

The database schema is bootstrapped automatically on server startup.

## Notes

- Authentication is local-only.
- Netlify, Firebase, and Google OAuth migration leftovers have been removed from the active runtime.
- `docker compose` is only used for PostgreSQL.
- `npm run dev` starts both the API and the Vite frontend.
