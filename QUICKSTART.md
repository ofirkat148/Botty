# Botty OSS - Quick Start Guide

## 🎯 Project Overview

Botty has been successfully migrated from Google Firebase to a fully open-source, locally-hostable architecture using:
- **Database**: PostgreSQL (with Drizzle ORM)
- **Authentication**: JWT + Google OAuth
- **Backend**: Express.js with Node.js
- **Frontend**: React 19 with API polling
- **Containerization**: Docker & Docker Compose
- **Orchestration**: Kubernetes (optional)

## ⚡ Getting Started in 5 Minutes

### 1. Configure Environment
```bash
cd /home/ofirkat/Downloads/Botty

# Edit .env.local with your Google OAuth credentials
# GOOGLE_CLIENT_ID=your_id
# GOOGLE_CLIENT_SECRET=your_secret
```

### 2. Start with Docker Compose
```bash
docker-compose up
```

### 3. Access the Application
- Application: http://localhost:5000
- Database: `postgresql://botty_user:botty_pass@localhost:5432/botty_db`

That's it! The database schema is created automatically.

## 📋 Implementation Summary

### ✅ Completed
- [x] Phase 1: PostgreSQL + Drizzle ORM schema
- [x] Phase 2: JWT + Google OAuth authentication
- [x] Phase 3: 30+ API endpoints migrated
- [x] Phase 4: API polling for real-time updates
- [x] Phase 5: Firebase dependencies removed
- [x] Phase 6: Docker & Docker Compose setup

### 📚 New Project Structure
```
src/
├── db/
│   ├── schema.ts         # 13 Drizzle ORM table definitions
│   └── index.ts          # Database connection management
├── middleware/
│   └── auth.ts           # JWT authentication middleware
├── routes/
│   ├── auth.ts           # Google OAuth endpoints
│   ├── history.ts        # Chat history API
│   ├── memory.ts         # Facts, files, URLs API
│   ├── settings.ts       # User settings API
│   ├── keys.ts           # API key management
│   └── usage.ts          # Token usage tracking
├── utils/
│   ├── jwt.ts            # JWT utilities
│   └── google-oauth.ts   # Google OAuth client
├── hooks/
│   └── useFetch.ts       # API polling hook
├── App.tsx               # Frontend (TODO: migrate from Firebase)
└── main.tsx              # Entry point

server-oss.ts            # New Express.js server (uses PostgreSQL)
server.ts                # Old Firebase server (keep for reference)
docker-compose.yml       # Multi-container orchestration
Dockerfile              # Node.js container image
drizzle.config.ts       # ORM configuration
```

## 🔌 API Endpoints

All endpoints except `/api/auth/google-url` require JWT token in `Authorization: Bearer {token}` header.

### Authentication
```bash
# Get Google OAuth URL
GET /api/auth/google-url

# Handle OAuth callback
POST /api/auth/google-callback
Body: { code: "..." }
```

### Chat History
```bash
GET  /api/history           # Get chat history
POST /api/history           # Add chat entry
DEL  /api/history/group/:id # Delete conversation
```

### Memory Management
```bash
GET  /api/memory/facts           # Get facts
POST /api/memory/facts           # Add fact
DEL  /api/memory/facts/:id       # Delete fact

GET  /api/memory/files           # Get files
POST /api/memory/files           # Add file
DEL  /api/memory/files/:id       # Delete file

GET  /api/memory/urls            # Get URLs
POST /api/memory/urls            # Add URL
DEL  /api/memory/urls/:id        # Delete URL
```

### Settings
```bash
GET  /api/settings              # Get settings
POST /api/settings              # Update settings
GET  /api/settings/user-settings # Get system prompt
POST /api/settings/user-settings # Update system prompt
```

### API Keys & Usage
```bash
GET  /api/keys          # Get API keys
POST /api/keys          # Add key
DEL  /api/keys/:provider # Delete key

GET  /api/usage         # Get today's usage
```

## 🚀 Development

### Run new server locally (requires Postgres)
```bash
# Start Docker Compose to run PostgreSQL
docker-compose up -d postgres

# Then run server
npm run dev
```

### Build for production
```bash
npm run build
docker-compose up
```

### Database management
```bash
# Push schema changes
npm run db:push

# Open Drizzle Studio (web UI for database)
npm run db:studio
```

## 🐳 Docker Commands

```bash
# Start all services
docker-compose up

# Start in background
docker-compose up -d

# Stop all services
docker-compose down

# View logs
docker-compose logs -f app
docker-compose logs -f postgres

# Connect to database
docker exec -it botty-postgres psql -U botty_user -d botty_db
```

## 📖 Frontend Migration

The frontend (src/App.tsx) still uses Firebase. To fully migrate:

1. **Remove Firebase imports**:
   ```typescript
   // OLD
   import { auth, db } from './firebase';

   // NEW
   // No Firebase needed!
   ```

2. **Replace auth flow**:
   ```typescript
   // OLD
   signInWithPopup(auth, googleProvider)

   // NEW
   const { authUrl } = await fetch('/api/auth/google-url').then(r => r.json());
   window.location.href = authUrl;
   // Then handle callback with POST /api/auth/google-callback
   ```

3. **Replace Firestore listeners**:
   ```typescript
   // OLD
   onSnapshot(collection(db, 'history'), (snapshot) => {
     setHistory(snapshot.docs.map(doc => doc.data()));
   });

   // NEW
   const { data: history } = useFetch('/api/history', { pollInterval: 3000 });
   ```

4. **Add JWT to API calls**:
   ```typescript
   const token = localStorage.getItem('authToken');
   fetch('/api/history', {
     headers: { 'Authorization': `Bearer ${token}` }
   });
   ```

**Note**: For now, you can run the new backend independently while gradually updating the frontend. The `useFetch` hook in `src/hooks/useFetch.ts` provides a starting point.

## 🔐 Security Notes

- **JWT_SECRET**: Must be strong and changed in production
- **API Keys**: Stored with base64 encoding (use real encryption in production)
- **CORS**: Configured for localhost:5000 (update for production)
- **Database**: Uses default credentials (change in production)

## 🐛 Troubleshooting

### Can't connect to database
```bash
# Check if Postgres container is running
docker ps | grep postgres

# View Postgres logs
docker logs botty-postgres
```

### Port already in use
Edit `docker-compose.yml`:
```yaml
ports:
  - "5433:5432"  # Changed from 5432
  - "5001:5000"  # Changed from 5000
```

### JWT token expired
- Clear `localStorage.removeItem('authToken')`
- Log in again

## 📁 Key Files to Update

1. **Frontend Components**: Gradually replace Firebase imports with API calls
2. **Server Routes**: Keep existing LLM endpoints, migrate data endpoints to new DB
3. **Environment Variables**: Set Google OAuth credentials
4. **Docker**: Already configured for PostgreSQL

## 🎓 Next Steps

1. **Test Local Setup**:
   ```bash
   docker-compose up
   # Visit http://localhost:5000
   ```

2. **Migrate Frontend** (gradual):
   - Update login flow
   - Update data fetching
   - Remove Firebase SDK

3. **Deploy** (optional):
   - Use Kubernetes manifests (see Phase 7)
   - Or deploy Docker image to your infrastructure

4. **Monitor** (optional):
   - Add logging
   - Set up metrics
   - Configure backups

## 📚 Documentation Files

- `IMPLEMENTATION_GUIDE.md` - Detailed migration guide
- `QUICKSTART.md` - This file
- `README.md` - Original project README

## 🆘 Support Resources

- **Drizzle ORM**: https://orm.drizzle.team/
- **Express.js**: https://expressjs.com/
- **JWT**: https://jwt.io/
- **Docker**: https://docs.docker.com/

---

**Status**: ✅ Backend migration complete | 🔄 Frontend migration in progress

For full details, see `IMPLEMENTATION_GUIDE.md`
