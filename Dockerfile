# syntax=docker/dockerfile:1.7

# ── Stage 1: Builder — installs ALL deps and builds the frontend ──────────────
FROM node:20 AS builder

WORKDIR /app

RUN npm config set fetch-timeout 120000 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retries 5

COPY package*.json ./

# Install all deps (including devDeps — needed for Vite build)
RUN --mount=type=secret,id=botty_resolv_conf,target=/etc/resolv.conf,required=false \
    --mount=type=cache,target=/root/.npm,id=npm-builder \
    npm ci

COPY . .

# Build the Vite frontend
RUN npm run build

# ── Stage 2: Prod-deps — installs only production deps on the same base ───────
# Using the same node:20 Debian base as the builder so that native modules
# compiled here (e.g. better-sqlite3) are binary-compatible with the runtime.
FROM node:20 AS prod-deps

WORKDIR /app

RUN npm config set fetch-timeout 120000 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retries 5

COPY package*.json ./

RUN --mount=type=secret,id=botty_resolv_conf,target=/etc/resolv.conf,required=false \
    --mount=type=cache,target=/root/.npm,id=npm-prod \
    npm ci --omit=dev

# ── Stage 3: Runtime (Debian slim, ~300 MB vs ~1.5 GB) ───────────────────────
FROM node:20-slim AS runtime

WORKDIR /app

# Copy pre-compiled production node_modules — no npm install needed at runtime
COPY --from=prod-deps /app/node_modules ./node_modules

# Built frontend assets
COPY --from=builder /app/dist ./dist

# Server source, shared types, tsconfig, and package.json (needed by npm start)
COPY --from=builder /app/server ./server
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/package.json ./package.json

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5000

EXPOSE 5000

CMD ["npm", "run", "start"]
