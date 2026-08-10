FROM node:26-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile
COPY apps/api apps/api
COPY packages/contracts packages/contracts
RUN pnpm --filter @notes/contracts build && pnpm --filter @notes/api build

FROM node:26-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable \
    && addgroup -S -g 10001 notes \
    && adduser -S -D -H -u 10001 -G notes notes
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --prod --frozen-lockfile
COPY --from=build --chown=notes:notes /app/apps/api/dist apps/api/dist
COPY --from=build --chown=notes:notes /app/apps/api/drizzle apps/api/drizzle
COPY --from=build --chown=notes:notes /app/packages/contracts/dist packages/contracts/dist
WORKDIR /app/apps/api
USER 10001:10001
EXPOSE 4000
CMD ["node", "--disable-proto=throw", "dist/server.js"]
