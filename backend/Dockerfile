FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Install deps and build workspace (keeps things simple for monorepo)
COPY package.json package-lock.json* ./
COPY backend/package.json ./backend/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY . .

RUN npm ci
RUN npm run build --workspace @nimbus/api

WORKDIR /usr/src/app/backend
ENV NODE_ENV=production
EXPOSE 3000

# `rootDir` is the repository root, so the compiled output keeps the workspace
# layout under dist/. Pointing at dist/index.js starts a container that exits
# immediately with MODULE_NOT_FOUND.
CMD ["node", "dist/backend/src/index.js"]
