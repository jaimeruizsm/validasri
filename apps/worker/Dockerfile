# ---- Worker de ValidaSRI ----
# Imagen para desplegar el worker de procesamiento en un VPS.
FROM node:22-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# Se copian los manifiestos primero para aprovechar la cache de capas.
COPY package.json package-lock.json ./
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/sri-client/package.json ./packages/sri-client/package.json
COPY packages/validation/package.json ./packages/validation/package.json
COPY packages/export/package.json ./packages/export/package.json

# Instala solo lo necesario para el worker y sus paquetes.
RUN npm install --omit=dev --no-audit --no-fund \
  --workspace apps/worker \
  --workspace packages/shared \
  --workspace packages/database \
  --workspace packages/sri-client

# tsx ejecuta el TypeScript directamente en produccion (sin paso de build).
RUN npm install --no-save tsx@^4.19.2

COPY tsconfig.base.json ./
COPY apps/worker ./apps/worker
COPY packages/shared ./packages/shared
COPY packages/database ./packages/database
COPY packages/sri-client ./packages/sri-client
COPY packages/validation ./packages/validation
COPY packages/export ./packages/export

# Node 22 trae node:sqlite (experimental) sin dependencias nativas extra.
CMD ["npx", "tsx", "apps/worker/src/index.ts"]
