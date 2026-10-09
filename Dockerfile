FROM node:24-alpine AS dependencies
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY vendor/bank-pms-api-client-1.0.0.tgz ./vendor/bank-pms-api-client-1.0.0.tgz
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
RUN pnpm run build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Both runtime and e2e entrypoints are plain `node` commands, so the bundled
# package managers are dead weight whose transitive dependencies would ship
# their vulnerabilities in the scanned image.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
  /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
RUN addgroup -S pms && adduser -S -G pms pms
COPY --from=build --chown=pms:pms /workspace/.next/standalone ./
COPY --from=build --chown=pms:pms /workspace/.next/static ./.next/static
USER pms
EXPOSE 3000
CMD ["node", "server.js"]

# A dedicated, non-production target for the Docker integration probe. The
# runtime image remains minimal; this target carries the test dependency graph
# needed to create an encrypted NextAuth session in the E2E container.
FROM runtime AS e2e
USER root
COPY --from=dependencies --chown=pms:pms /workspace/node_modules ./node_modules
USER pms
