# Botty Firebase Migration Implementation Guide

## Current Status

This migration replaces Firebase (Firestore + Auth) with a local PostgreSQL database and JWT-based authentication. The implementation is organized in phases.

### ✅ Completed Phases

#### Phase 1: Database Setup ✅
- PostgreSQL database schema created using Drizzle ORM
- 13 Firestore collections mapped to PostgreSQL tables
- Files created:
  - `src/db/schema.ts` - Table definitions
  - `src/db/index.ts` - Database connection
  - `drizzle.config.ts` - Drizzle configuration

#### Phase 2: JWT Authentication ✅
- JWT token generation and verification
- Google OAuth 2.0 integration
- Auth middleware for protecting routes
- Files created:
  - `src/utils/jwt.ts` - JWT utilities
  - `src/utils/google-oauth.ts` - Google OAuth setup
  - `src/middleware/auth.ts` - Auth middleware
  - `src/routes/auth.ts` - OAuth endpoints

#### Phase 3: API Endpoints ✅
- Created new Express routes using Drizzle ORM
- Replaced Firestore calls with SQL queries
- Files created:
  - `src/routes/history.ts` - Chat history endpoints
  - `src/routes/memory.ts` - Facts, files, URLs endpoints
  - `src/routes/settings.ts` - User settings endpoints
  - `src/routes/keys.ts` - API key management
  - `src/routes/usage.ts` - Token usage tracking

#### Phase 4: Frontend Polling ✅
- Created polling hook to replace Firestore listeners
- File created:
  - `src/hooks/useFetch.ts` - API polling hook

#### Phase 6: Docker Setup ✅
- Docker containerization for local development
- Docker Compose configuration
- Files created:
  - `Dockerfile` - Node.js application container
  - `docker-compose.yml` - Multi-container setup
  - `.dockerignore` - Build optimization

### 🔄 In Progress / Pending Phases

#### Phase 5: Firebase Removal
- Remove Firebase dependencies from server
- Update frontend to use new auth system
- Delete Firebase config files

#### Phase 7: Kubernetes (Optional)
- Create K8s deployment manifests for production

## Quick Start Guide

### Prerequisites
- Docker and Docker Compose installed
- Google OAuth credentials (Client ID and Secret)
- Environment variables configured

### Setup Instructions

#### 1. Configure Environment Variables

Update `.env.local` with your credentials:
```bash
# Database (auto-configured in Docker Compose)
DATABASE_URL=postgresql://botty_user:botty_pass@localhost:5432/botty_db

# Google OAuth
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
JWT_SECRET=generate-a-random-secret-key

# Optional: LLM API Keys
GEMINI_API_KEY=your_key
OPENAI_API_KEY=your_key
```

#### 2. Start Docker Compose

```bash
# Start PostgreSQL and the application
docker-compose up

# The app will be available at http://localhost:5000
# PostgreSQL will be available at localhost:5432
```

#### 3. Database Initialization

The database schema is automatically created on first run. To manually create tables:

```bash
npm run db:push
```

#### 4. Access the Application

- Frontend: http://localhost:5000
- PostgreSQL: localhost:5432 (use DBeaver or pgAdmin to connect)

## API Endpoints

### Authentication
- `GET /api/auth/google-url` - Get Google OAuth URL
- `POST /api/auth/google-callback` - Handle OAuth callback (body: `{ code }`)

### History (Requires JWT)
- `GET /api/history` - Get chat history
- `POST /api/history` - Add chat entry
- `DELETE /api/history/group/:conversationId` - Delete conversation

### Memory (Requires JWT)
- `GET /api/memory/facts` - Get facts
- `POST /api/memory/facts` - Add fact
- `DELETE /api/memory/facts/:id` - Delete fact
- `GET /api/memory/files` - Get memory files
- `POST /api/memory/files` - Add memory file
- `DELETE /api/memory/files/:id` - Delete memory file
- `GET /api/memory/urls` - Get memory URLs
- `POST /api/memory/urls` - Add memory URL
- `DELETE /api/memory/urls/:id` - Delete memory URL

### Settings (Requires JWT)
- `GET /api/settings` - Get user settings
- `POST /api/settings` - Update user settings
- `GET /api/settings/user-settings` - Get system prompt
- `POST /api/settings/user-settings` - Update system prompt

### Keys (Requires JWT)
- `GET /api/keys` - Get API keys
- `POST /api/keys` - Add API key
- `DELETE /api/keys/:provider` - Delete API key

### Usage (Requires JWT)
- `GET /api/usage` - Get today's token usage

## Frontend Migration

The frontend currently uses Firebase. To migrate:

1. Remove Firebase imports from `src/App.tsx`:
   ```typescript
   // Remove: import { auth, googleProvider, db } from './firebase';
   ```

2. Replace Firebase auth with new OAuth flow:
   ```typescript
   // Old: signInWithPopup(auth, googleProvider)
   // New: GET /api/auth/google-url, then POST /api/auth/google-callback
   ```

3. Replace Firestore listeners with polling:
   ```typescript
   // Old: onSnapshot(collection(db, 'history'), ...)
   // New: useFetch('/api/history')
   ```

4. Add JWT token management:
   ```typescript
   const token = localStorage.getItem('authToken');
   // Include in API calls: Authorization: Bearer {token}
   ```

## Data Migration from Firebase

If you have existing Firestore data:

1. Export Firestore collections as JSON
2. Create a migration script in `src/db/migrations/`
3. Run migration before deploying to production

Example structure:
```typescript
// src/db/migrations/migrate-firebase-data.ts
import { getDatabase } from '../index.js';
import firebaseData from './firestore-export.json';

export async function migrateFirebaseData() {
  const db = getDatabase();
  // Insert data into PostgreSQL tables
}
```

## Database Schema

### Core Tables
- `users` - User profiles
- `history` - Chat history
- `facts` - Memory facts
- `memory_files` - Uploaded files
- `memory_urls` - Saved URLs
- `api_keys` - Encrypted API keys
- `settings` - User settings
- `user_settings` - System prompts
- `user_tokens` - OAuth tokens
- `daily_usage` - Token usage tracking

### Telegram Tables
- `telegram_links` - Telegram chat links
- `tg_model_selection` - Selected models per chat
- `tg_system_prompts` - Custom prompts per chat
- `tg_sandbox` - Sandbox mode per chat
- `tg_sessions` - Telegram session data

## Troubleshooting

### Database Connection Fails
```bash
# Check PostgreSQL is running
docker ps | grep postgres

# View logs
docker logs botty-postgres

# Test connection
docker exec botty-postgres psql -U botty_user -d botty_db -c "SELECT 1"
```

### Port Already in Use
```bash
# Change ports in docker-compose.yml
# PostgreSQL: 5432 → 5433
# App: 5000 → 5001
```

### Auth Token Issues
- Clear localStorage: `localStorage.clear()`
- Re-login with Google
- Check JWT_SECRET is set in .env.local

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| DATABASE_URL | Yes | PostgreSQL connection string |
| GOOGLE_CLIENT_ID | Yes | Google OAuth client ID |
| GOOGLE_CLIENT_SECRET | Yes | Google OAuth client secret |
| JWT_SECRET | Yes | Secret for signing JWT tokens |
| REDIRECT_URI | No | OAuth callback URL (default: http://localhost:5000/api/auth/google-callback) |
| GEMINI_API_KEY | No | Gemini AI API key |
| OPENAI_API_KEY | No | OpenAI API key |
| ANTHROPIC_API_KEY | No | Anthropic API key |
| TELEGRAM_BOT_TOKEN | No | Telegram bot token |
| PORT | No | Server port (default: 5000) |

## Next Steps

1. **Test the new server locally**:
   ```bash
   docker-compose up
   ```

2. **Migrate frontend components** to use new APIs

3. **Test all endpoints** with JWT authentication

4. **Remove Firebase** from codebase (Phase 5)

5. **Deploy with Kubernetes** (Phase 7, optional)

## Files Changed/Created

### New Files
- ✅ `src/db/schema.ts`
- ✅ `src/db/index.ts`
- ✅ `src/utils/jwt.ts`
- ✅ `src/utils/google-oauth.ts`
- ✅ `src/middleware/auth.ts`
- ✅ `src/routes/auth.ts`
- ✅ `src/routes/history.ts`
- ✅ `src/routes/memory.ts`
- ✅ `src/routes/settings.ts`
- ✅ `src/routes/keys.ts`
- ✅ `src/routes/usage.ts`
- ✅ `src/hooks/useFetch.ts`
- ✅ `server-oss.ts`
- ✅ `drizzle.config.ts`
- ✅ `Dockerfile`
- ✅ `docker-compose.yml`
- ✅ `.dockerignore`
- ✅ `.env.local`

### Modified Files
- ✅ `package.json` - Updated dependencies and scripts
- ✅ `.env.example` - Updated with new variables

### Files to Delete (Phase 5)
- `src/firebase.ts`
- `firebase-applet-config.json`
- `firebase-applet-config.json.bak`
- `firestore.rules`
- `firebase-blueprint.json`
- `metadata.json`

## Support

For issues or questions:
1. Check the Troubleshooting section
2. Review environment variables
3. Check Docker logs: `docker logs botty-app`
4. Check PostgreSQL logs: `docker logs botty-postgres`
