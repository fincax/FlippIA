# FlippIA production image. Multi-stage: dependencies → build → runtime.
# The runtime keeps dev dependencies (tsx, drizzle-kit) so the operational
# scripts (db:migrate, db:seed, radar:sync, sources:check) run inside the
# same image: `docker compose -f docker-compose.prod.yml run --rm app pnpm db:migrate`.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 CI=true
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
# Chromium for Playwright is not needed in production.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# A placeholder secret lets `next build` load the env module; the real one comes at runtime.
RUN APP_SECRET=build-time-placeholder-secret-not-used-at-runtime pnpm build

FROM base AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "start"]
