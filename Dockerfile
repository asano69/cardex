# syntax=docker/dockerfile:1

# ==========================================
# Stage 0: Bun (vendor frontend assets)
# ==========================================
FROM oven/bun:1-alpine AS node-builder
# Passed through to vite.config.js's `define` at build time; defaults to
# "myapp" to match the Go backend's default (see internal/config).
ARG APP_NAME=MyApp
ENV APP_NAME=${APP_NAME}
WORKDIR /build/frontend
# Copy only dependency manifests first to leverage Docker layer caching
COPY frontend/package.json frontend/bun.lock* ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile
# Copy the rest of the frontend source code and build
COPY frontend/ ./
RUN bun run build

# ==========================================
# Stage 1: Go Builder
# ==========================================
FROM golang:1.26-alpine AS go-builder
# Injected into internal/version.Version at build time; defaults to "dev"
# so a plain `docker build` without --build-arg still produces a runnable image.
ARG VERSION=dev
WORKDIR /build
# Copy and download Go dependencies first
COPY go.mod go.sum* ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download
# Copy frontend build artifacts just before the Go compilation step
COPY --from=node-builder /build/internal/static/dist ./internal/static/dist
# Copy Go source files last, as they change most frequently
COPY cmd/ ./cmd/
COPY internal/ ./internal/
COPY migrations/ ./migrations/
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X github.com/asano69/myapp/internal/version.Version=${VERSION}" -o myapp ./cmd/myapp

# ==========================================
# Stage 2: Runtime
# ==========================================
FROM alpine:3.23
WORKDIR /myapp

RUN apk add --no-cache \
    ca-certificates \
    su-exec \
    busybox-extras \
    tzdata \
    bash \
    curl \
    sqlite
 
RUN addgroup -g 1000 myapp && \
    adduser -D -u 1000 -G myapp myapp

COPY --from=go-builder /build/myapp /usr/local/bin/myapp

RUN mkdir -p /certs /myapp/pb_data
RUN chown -R myapp:myapp /myapp

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["myapp", "serve"]

