# syntax=docker/dockerfile:1.9

FROM node:24-alpine AS base
WORKDIR /repo
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

# ---- Dependencies (cacheable layer) ----
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY app/package.json ./app/package.json
COPY microservice/package.json ./microservice/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch --filter dineros-app... && pnpm install --frozen-lockfile --offline --filter dineros-app...

# ---- Build stage ----
FROM deps AS build
COPY app ./app
WORKDIR /repo/app
# Prisma config requires DATABASE_URL at generate time; placeholder is enough (no DB connection)
ENV DATABASE_URL="mysql://build:build@localhost:3306/build"
RUN pnpm prisma generate
# Set environment for build
ENV NODE_ENV=production
# Build the application
RUN pnpm run build

# ---- Runtime stage (slim final image) ----
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 appgroup \
  && adduser --system --uid 1001 --ingroup appgroup appuser

# Copy only the built output, not the entire build toolchain
COPY --from=build /repo/app/.output /app/.output
# Prisma schema is read at runtime by field-encryption normalizer for @encrypted field docs
COPY --from=build /repo/app/prisma /app/prisma
RUN chown -R appuser:appgroup /app

ARG PORT=3000
ENV PORT=$PORT
EXPOSE $PORT

USER appuser

CMD ["node", ".output/server/index.mjs"]
