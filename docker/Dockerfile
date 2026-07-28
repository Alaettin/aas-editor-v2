# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# --- Build ---
# Installieren und Bauen liegen bewusst in einer Stufe: pnpm verlinkt node_modules
# symbolisch in einen virtuellen Store, das ueberlebt ein Kopieren zwischen Stufen nicht.
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm --filter @aas-editor/web build \
  && pnpm --filter @aas-editor/server build \
  && node scripts/check-bundle-budget.mjs

# --- Laufzeit ---
FROM base AS runtime
ENV NODE_ENV=production
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
# Der Server ist gebuendelt, er braucht zur Laufzeit nur die externen Pakete.
RUN pnpm install --frozen-lockfile --prod --filter @aas-editor/server

COPY --from=build /app/apps/server/dist ./apps/server/dist
# Das Frontend wird in Phase 9 vom Server ausgeliefert. Bis dahin laeuft es ueber Vite.
COPY --from=build /app/apps/web/dist ./apps/web/dist

EXPOSE 3200
USER node
CMD ["node", "apps/server/dist/index.js"]
