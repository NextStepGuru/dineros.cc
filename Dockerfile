# syntax=docker/dockerfile:1.9

FROM node:24-alpine AS base
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

# ---- Dependencies (cacheable layer) ----
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch && pnpm install --frozen-lockfile --offline

# ---- Build stage ----
FROM deps AS build
COPY . .
# Prisma config requires DATABASE_URL at generate time; placeholder is enough (no DB connection)
ENV DATABASE_URL="mysql://build:build@localhost:3306/build"
ENV PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1
RUN pnpm prisma generate
# Set environment for build
ENV NODE_ENV=production
# Build the application
RUN pnpm run build

# ---- Runtime stage (slim final image) ----
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy only the built output, not the entire build toolchain
COPY --from=build /app/.output /app/.output
# Prisma schema is read at runtime by field-encryption normalizer for @encrypted field docs
COPY --from=build /app/prisma /app/prisma

ARG PORT=3000
ENV PORT=$PORT
EXPOSE $PORT

CMD ["node", ".output/server/index.mjs"]
