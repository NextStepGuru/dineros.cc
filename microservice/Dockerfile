# syntax=docker/dockerfile:1.9

FROM node:24-alpine AS base
WORKDIR /repo
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

# ---- Dependencies (cacheable layer) ----
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY microservice/package.json ./microservice/package.json
COPY app/package.json ./app/package.json
RUN --mount=type=cache,id=pnpm-microservice-store,target=/pnpm/store \
    pnpm fetch --filter microservice... && pnpm install --frozen-lockfile --offline --filter microservice...

# ---- Build stage ----
FROM deps AS build
COPY microservice ./microservice
WORKDIR /repo/microservice
# Prisma config requires DATABASE_URL at generate time; placeholder is enough (no DB connection)
ENV DATABASE_URL="mysql://build:build@localhost:3306/build"
RUN pnpm prisma generate

# ---- Runtime stage ----
FROM node:24-alpine AS runner
WORKDIR /repo/microservice
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 appgroup \
  && adduser --system --uid 1001 --ingroup appgroup appuser

# Set up pnpm environment for runtime
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

# Copy workspace install and microservice sources from build stage
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/package.json /repo/package.json
COPY --from=build /repo/pnpm-workspace.yaml /repo/pnpm-workspace.yaml
COPY --from=build /repo/microservice /repo/microservice

RUN chown -R appuser:appgroup /repo

ARG PORT=3000
ENV PORT=$PORT
EXPOSE $PORT

USER appuser

# Use test-start script for testing (skips migration)
CMD ["sh", "-c", "if [ \"$NODE_ENV\" = \"test\" ]; then pnpm test-start; else pnpm start; fi"]

# ---- Staging CronJob: kubectl + curl + jq for in-cluster DB key rotation (not the default image) ----
FROM runner AS runner-keyrotate
USER root
RUN apk add --no-cache curl jq ca-certificates
ARG KUBECTL_VERSION=v1.31.6
RUN curl -fsSL -o /tmp/kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" \
  && install -m 0755 /tmp/kubectl /usr/local/bin/kubectl \
  && rm -f /tmp/kubectl
COPY microservice/scripts/k8s-rotate-db-key.sh /repo/microservice/scripts/k8s-rotate-db-key.sh
RUN chmod 0555 /repo/microservice/scripts/k8s-rotate-db-key.sh \
  && chown appuser:appgroup /repo/microservice/scripts/k8s-rotate-db-key.sh
USER appuser

# Default `docker build` target remains the main microservice image (duplicate final stage).
FROM runner
