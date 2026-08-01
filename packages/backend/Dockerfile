# Build context is the monorepo root (set in docker-compose.yml)
FROM node:20-alpine
WORKDIR /app

# ── 1. Install dependencies (cached layer) ────────────────────────────────────
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/backend/package*.json ./packages/backend/

RUN npm ci

# ── 2. Copy source and build ──────────────────────────────────────────────────
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend

RUN npm run build -w packages/shared
RUN npm run build -w packages/backend

# ── 3. Run ────────────────────────────────────────────────────────────────────
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "packages/backend/dist/index.js"]
