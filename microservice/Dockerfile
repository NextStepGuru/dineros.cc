# syntax=docker/dockerfile:1.9

FROM node:22-alpine AS base
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

# ---- Dependencies (cacheable layer) ----
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-microservice-store,target=/pnpm/store \
    pnpm fetch && pnpm install --frozen-lockfile --offline

# ---- Build stage ----
FROM deps AS build
COPY . .
# Generate Prisma client
ENV PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1
RUN pnpm prisma generate

# ---- Runtime stage ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Set up pnpm environment for runtime
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

# Copy the complete node_modules and dependencies from build stage
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/package.json /app/
COPY --from=build /app/*.ts /app/
COPY --from=build /app/*.js /app/
COPY --from=build /app/routes /app/routes
COPY --from=build /app/lib /app/lib
COPY --from=build /app/clients /app/clients
COPY --from=build /app/prisma /app/prisma

ARG PORT=3000
ENV PORT=$PORT
EXPOSE $PORT

# Use test-start script for testing (skips migration)
CMD ["sh", "-c", "if [ \"$NODE_ENV\" = \"test\" ]; then pnpm test-start; else pnpm start; fi"]
