# syntax=docker/dockerfile:1

# ----------------------------------------------------
# 1. Base Builder Stage (Go binaries)
# ----------------------------------------------------
FROM golang:alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/api ./cmd/quagenticus-api
RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/mcp ./cmd/quagenticus-mcp
RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/worker ./cmd/quagenticus-worker

# ----------------------------------------------------
# 2. Target: API Service
# ----------------------------------------------------
FROM gcr.io/distroless/static-debian12 AS api
COPY --from=builder /bin/api /api
EXPOSE 8080
ENTRYPOINT ["/api"]

# ----------------------------------------------------
# 3. Target: MCP Server
# ----------------------------------------------------
FROM gcr.io/distroless/static-debian12 AS mcp
COPY --from=builder /bin/mcp /mcp
EXPOSE 8081
ENTRYPOINT ["/mcp"]

# ----------------------------------------------------
# 4. Target: Background Worker
# ----------------------------------------------------
FROM gcr.io/distroless/static-debian12 AS worker
COPY --from=builder /bin/worker /worker
ENTRYPOINT ["/worker"]

# ----------------------------------------------------
# 5. Target: Database Migrator & Installer
# ----------------------------------------------------
FROM postgres:16-alpine AS migrator
RUN apk add --no-cache bash
WORKDIR /db
COPY db/ /db/
RUN chmod +x /db/install_database.sh
ENTRYPOINT ["/db/install_database.sh"]

# ----------------------------------------------------
# 6. Target: Frontend Web SPA (Nginx)
# ----------------------------------------------------
FROM node:22-alpine AS web-builder
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM nginx:alpine AS web
COPY --from=web-builder /web/dist /usr/share/nginx/html
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

