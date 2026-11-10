# syntax=docker/dockerfile:1
#
# Nimbus API image. Build from the repository root:
#   docker build -f backend/Dockerfile -t nimbus-api .
#
# One image serves both process groups:
#   API:     node dist/backend/src/index.js   (default CMD, listens on $PORT=4000)
#   Scanner: node dist/backend/src/scan.js
#
# Only the backend and @nimbus/shared workspaces are installed; the Expo app's
# dependencies never enter the image.

ARG NODE_IMAGE=node:22-alpine

# ── deps: production dependencies only ───────────────────────────────────────
FROM ${NODE_IMAGE} AS deps
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY packages/shared/package.json packages/shared/
COPY mobile/package.json mobile/
RUN npm ci --omit=dev --ignore-scripts \
      --workspace @nimbus/api --workspace @nimbus/shared \
 && mkdir -p backend/node_modules packages/shared/node_modules

# ── build: full dependencies, compile shared then the API ────────────────────
FROM ${NODE_IMAGE} AS build
WORKDIR /usr/src/app
COPY package.json package-lock.json tsconfig.base.json ./
COPY backend/package.json backend/
COPY packages/shared/package.json packages/shared/
COPY mobile/package.json mobile/
RUN npm ci --ignore-scripts --workspace @nimbus/api --workspace @nimbus/shared
COPY packages/shared/ packages/shared/
COPY backend/ backend/
# @nimbus/shared resolves to packages/shared/dist at runtime, so it must be
# built; the API's tsc build only typechecks its sources.
RUN npm run build -w @nimbus/shared \
 && npm run build -w @nimbus/api

# ── runtime ──────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=4000
WORKDIR /usr/src/app

COPY --from=deps --chown=node:node /usr/src/app/package.json ./
COPY --from=deps --chown=node:node /usr/src/app/node_modules ./node_modules

COPY --from=deps  --chown=node:node /usr/src/app/packages/shared/package.json packages/shared/
COPY --from=deps  --chown=node:node /usr/src/app/packages/shared/node_modules packages/shared/node_modules
COPY --from=build --chown=node:node /usr/src/app/packages/shared/dist packages/shared/dist

COPY --from=deps  --chown=node:node /usr/src/app/backend/package.json backend/
COPY --from=deps  --chown=node:node /usr/src/app/backend/node_modules backend/node_modules
COPY --from=build --chown=node:node /usr/src/app/backend/dist backend/dist
# Operational scripts and the raw SQL they apply (tsc does not copy .sql).
COPY --from=build --chown=node:node /usr/src/app/backend/scripts backend/scripts
COPY --from=build --chown=node:node /usr/src/app/backend/src/db/migrations backend/src/db/migrations

WORKDIR /usr/src/app/backend
USER node
EXPOSE 4000

# `rootDir` is the repository root, so the compiled output keeps the workspace
# layout under dist/. Pointing at dist/index.js starts a container that exits
# immediately with MODULE_NOT_FOUND.
CMD ["node", "dist/backend/src/index.js"]
