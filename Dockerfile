# syntax=docker/dockerfile:1.7
# Multi-stage build on Bun: dependencies → build → minimal non-root runtime (Next.js standalone output).

FROM oven/bun:1.4.2-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_OUTPUT=standalone
RUN bun run build

# One-off migration runner:  docker compose run --rm migrate
FROM build AS migrate
CMD ["bun", "run", "db:migrate"]

FROM oven/bun:1.4.2-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# The oven/bun image ships an unprivileged "bun" user.
COPY --from=build --chown=bun:bun /app/.next/standalone ./
COPY --from=build --chown=bun:bun /app/.next/static ./.next/static
COPY --from=build --chown=bun:bun /app/drizzle ./drizzle
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["bun", "server.js"]
