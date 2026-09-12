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
RUN addgroup -S pms && adduser -S -G pms pms
COPY --from=build --chown=pms:pms /workspace/.next/standalone ./
COPY --from=build --chown=pms:pms /workspace/.next/static ./.next/static
USER pms
EXPOSE 3000
CMD ["node", "server.js"]
