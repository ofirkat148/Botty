# syntax=docker/dockerfile:1.7

# ── Stage 1: Build ─────────────────────────────────────────────────────────
FROM node:20 AS builder

WORKDIR /app

RUN npm config set fetch-timeout 120000 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retries 5

COPY package*.json ./

# Install all deps (including devDeps — tsx is needed at runtime)
RUN --mount=type=secret,id=botty_resolv_conf,target=/etc/resolv.conf,required=false \
    --mount=type=cache,target=/root/.npm \
    npm install

COPY . .

# Build the Vite frontend
RUN npm run build

# ── Stage 2: Runtime ───────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Copy only what the server needs to run
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/shared ./shared

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5000

EXPOSE 5000

CMD ["npm", "run", "start"]
