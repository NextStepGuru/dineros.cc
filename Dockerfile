# syntax=docker/dockerfile:1.9

FROM node:22-alpine AS base
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
# Generate Prisma client
ENV PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1
RUN pnpm prisma generate
# Set environment for build
ARG NUXT_UI_PRO_LICENSE
ENV NUXT_UI_PRO_LICENSE=$NUXT_UI_PRO_LICENSE
ENV NODE_ENV=production
# Build the application
RUN pnpm run build

# ---- Runtime stage (slim final image) ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy only the built output, not the entire build toolchain
COPY --from=build /app/.output /app/.output

ARG PORT=3000
ENV PORT=$PORT
EXPOSE $PORT

CMD ["node", ".output/server/index.mjs"]
