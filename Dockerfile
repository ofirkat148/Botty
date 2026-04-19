# syntax=docker/dockerfile:1.7

# ── Stage 1: Builder — installs ALL deps, builds frontend, then prunes ────────
FROM node:20 AS builder

WORKDIR /app

RUN npm config set fetch-timeout 120000 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retries 5

COPY package*.json ./

# Install production deps only — this is the lightweight fast install
RUN --mount=type=secret,id=botty_resolv_conf,target=/etc/resolv.conf,required=false \
    npm ci --omit=dev

# Install ONLY the devDeps needed for the Vite build (skips playwright/tesseract/pdfjs)
# tailwind-merge, clsx, lucide-react etc. are already installed as prod deps
RUN --mount=type=secret,id=botty_resolv_conf,target=/etc/resolv.conf,required=false \
    npm install --no-save \
        vite \
        @vitejs/plugin-react \
        "@tailwindcss/vite" \
        tailwindcss \
        typescript \
        tsx \
        "@types/node" \
        "@types/express" \
        "@types/jsonwebtoken" \
        "@types/pg" \
        "@types/better-sqlite3" \
        "@types/express-rate-limit"

COPY . .

# Build the Vite frontend
RUN npm run build

# Remove the build-only devDeps before copying to runtime (prune back to prod-only)
RUN npm prune --omit=dev

# ── Stage 2: Runtime (Debian slim, ~300 MB vs ~1.5 GB) ───────────────────────
FROM node:20-slim AS runtime

WORKDIR /app

# Copy pruned production node_modules — native modules stay binary-compatible
# because both builder and runtime use the same Debian/glibc base
COPY --from=builder /app/node_modules ./node_modules

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
