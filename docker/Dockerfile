# syntax=docker/dockerfile:1

# bookworm-slim statt alpine: better-sqlite3 liefert glibc-Prebuilds. Unter musl gaebe es
# keine, das Modul wuerde uebersetzt, und dafuer fehlen python3, make und g++ in beiden
# Stufen. Eine Zeile Basisimage spart den ganzen Compiler-Aufbau.
FROM node:22-bookworm-slim AS base
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
# Der Server ist gebuendelt, er braucht zur Laufzeit nur die externen Pakete. Dazu gehoert
# better-sqlite3: ein natives Modul laesst sich nicht buendeln.
RUN pnpm install --frozen-lockfile --prod --filter @aas-editor/server

COPY --from=build /app/apps/server/dist ./apps/server/dist
# Die Migrationen werden beim Start angewendet. drizzle-kit ist devDependency und liegt
# hier nicht vor, der generierte Ordner muss deshalb mit ins Image.
COPY --from=build /app/apps/server/drizzle ./apps/server/drizzle
# Das Frontend wird in Phase 9 vom Server ausgeliefert. Bis dahin laeuft es ueber Vite.
COPY --from=build /app/apps/web/dist ./apps/web/dist

# Das benannte Volume erbt Eigentuemer und Rechte dieses Pfads, wenn es leer angelegt wird.
# Ohne diesen Schritt scheitert der erste Schreibzugriff als Benutzer node mit
# SQLITE_CANTOPEN, was wie ein Treiberfehler aussieht.
RUN mkdir -p /data/attachments && chown -R node:node /data

EXPOSE 3200
USER node
CMD ["node", "apps/server/dist/index.js"]
