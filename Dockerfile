# Builds one image that serves both the API and the client bundle.
#
# One image, not two, because the client cannot reach a cross-origin API:
# every request it makes is a relative /api path and both cookies are
# SameSite=Lax. See server/src/staticClient.js for the full reasoning. The
# server serves client/dist itself, so this image is the whole deployable.
#
# Deliberately platform-agnostic. docker-compose.yml runs Postgres and Redis
# for local development and does NOT build this image -- development still
# runs Vite and node --watch natively, which CLAUDE.md records as a decision.

# ---- build ------------------------------------------------------------------
# Node 24 to match the engines field (^22.13 || >=24) and .nvmrc.
FROM node:24-slim AS build

WORKDIR /app

# Workspaces resolve from the root manifest, so all three package.json files
# have to be present before install for the lockfile to be honoured.
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

# `npm ci` runs the `prepare` script, which configures git hooks and has no
# meaning in an image with no .git directory. --ignore-scripts skips it; the
# Prisma client is generated explicitly below instead of via postinstall.
RUN npm ci --ignore-scripts

COPY . .

# The schema lives in server/prisma and the client is generated into
# node_modules, so this must happen after the source copy and before the build.
RUN npm run prisma:generate -w server
RUN npm run build

# ---- runtime ----------------------------------------------------------------
FROM node:24-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Production dependencies only. Prisma's generated client lives in
# node_modules, so it is regenerated here rather than copied across stages,
# where a devDependency-pruned tree would not match.
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN npm ci --omit=dev --ignore-scripts

COPY server ./server
COPY --from=build /app/client/dist ./client/dist
RUN npm run prisma:generate -w server

# The migration runner reads plain .sql from here; it is not part of server/src.
COPY server/db ./server/db

# node:slim ships a non-root `node` user. Running as root would let a
# path-traversal bug in static serving read the whole filesystem.
USER node

EXPOSE 5000

# /api/health is liveness only and touches no dependency, which is what a
# container healthcheck wants -- /api/ready reports Postgres and Redis and
# would restart the container during an unrelated database blip.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migrations are NOT run here. They must land before the new code starts --
# 002_password_changed_at.sql adds a column userReadRepository selects on every
# user read, so a server started against an unmigrated database fails every
# authenticated request, not just the new routes. Run
# `npm run migrate:postgres -w server` as a release step before the cutover.
CMD ["npm", "run", "start"]
