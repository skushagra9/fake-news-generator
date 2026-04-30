# Multi-stage: build with Node, serve static with nginx.
FROM node:20-alpine AS builder
WORKDIR /app

# Build-time arg for Vite's public env. Empty in compose (we use the nginx
# /api proxy and same-origin requests).
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json tsconfig.node.json vite.config.ts index.html ./
COPY src ./src
RUN npm run build

# ---- Runtime: nginx serving the SPA + reverse-proxying /api ----
FROM nginx:1.27-alpine AS runtime
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
