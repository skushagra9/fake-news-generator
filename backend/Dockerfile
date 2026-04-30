# Multi-stage build: smaller runtime image, no dev deps in prod.
FROM node:20-alpine AS builder
WORKDIR /app

# Prisma needs OpenSSL.
RUN apk add --no-cache openssl

# Install deps first (better layer caching).
COPY package.json package-lock.json* ./
# Skip @prisma/client postinstall here — schema isn't copied yet. We run
# generate explicitly below once the schema is present.
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=1
RUN npm install --no-audit --no-fund

# Copy schema and generate the client.
COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Strip dev deps in place to keep the runtime image small.
RUN npm prune --omit=dev

# ---- Runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache openssl

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./

EXPOSE 4000
CMD ["node", "dist/index.js"]
