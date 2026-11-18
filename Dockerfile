FROM node:24-bookworm-slim AS toolchain
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

FROM toolchain AS build
COPY package*.json ./
RUN npm ci
COPY . .
RUN DATABASE_URL=/tmp/build.sqlite AI_MODE=mock npm run build

FROM toolchain AS runtime-deps
COPY deploy/runtime/package*.json ./
RUN npm ci --omit=dev --omit=peer

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATABASE_URL=/var/lib/sales-coach/sales-coach.sqlite
COPY --from=runtime-deps --chown=node:node /app/package.json ./
COPY --from=runtime-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/next.config.ts ./
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/drizzle ./drizzle
RUN mkdir -p /var/lib/sales-coach /var/backups/sales-coach && chown node:node /var/lib/sales-coach /var/backups/sales-coach
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["sh", "-c", "node scripts/validate-release.mjs && exec ./node_modules/.bin/next start --hostname 0.0.0.0"]
