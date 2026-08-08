# syntax=docker/dockerfile:1

# bookworm-slim statt alpine: glibc statt musl. Der urspruengliche Grund ("better-sqlite3
# liefert glibc-Prebuilds") hat sich beim ersten echten Bau am 06.08.2026 als falsch
# erwiesen: 13.0.3 ruft ohne Umweg `node-gyp rebuild` auf, es wird also **immer**
# uebersetzt. Die Werkzeuge dafuer kommen deshalb je Stufe dazu, in der Laufzeitstufe in
# derselben Schicht wieder weg.
FROM node:22-bookworm-slim AS base
# pnpm fest installiert statt ueber Corepack.
#
# Corepack fragt vor dem Herunterladen einer Paketverwaltung nach: "Corepack is about to
# download ... Do you want to continue? [Y/n]". Im Bau steht niemand am Terminal, und die
# Frage haelt den Lauf an, bis der Bauserver nach einer Stunde abbricht. Genau das ist am
# 08.08.2026 passiert. Vorher fiel es nie auf: die Schicht kam aus dem Cache, pnpm lag also
# schon im Image.
#
# Die Fassung muss zu `packageManager` in der package.json passen. Weicht sie ab, bricht
# `--frozen-lockfile` sofort und sichtbar ab, statt still etwas anderes zu bauen.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN npm install -g pnpm@10.30.3
WORKDIR /app

# --- Build ---
# Installieren und Bauen liegen bewusst in einer Stufe: pnpm verlinkt node_modules
# symbolisch in einen virtuellen Store, das ueberlebt ein Kopieren zwischen Stufen nicht.
FROM base AS build
# Wird mit der Stufe verworfen, deshalb ohne Aufraeumen.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++

# Erst die Manifeste, dann installieren, dann der Quelltext.
#
# Bis zum 08.08.2026 stand hier `COPY . .` **vor** der Installation. Damit entwertete jede
# Codeaenderung die Schicht, in der installiert und gebaut wird: aus einer Aenderung an
# einer .tsx-Datei wurde ein Vollbau samt Uebersetzen von better-sqlite3. Solange der Cache
# griff, fiel das nicht auf; beim ersten kalten Bau lief es in das Ein-Stunden-Limit.
#
# Kein Paket hat ein `prepare`-Skript, die Installation kommt also ohne den Quelltext aus.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @aas-editor/web build \
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
# Uebersetzen und Aufraeumen in **einer** Schicht: waere das Entfernen eine eigene Zeile,
# steckten die rund 200 MB Werkzeuge weiterhin in der darunterliegenden.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && pnpm install --frozen-lockfile --prod --filter @aas-editor/server \
  && apt-get purge -y python3 make g++ \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/apps/server/dist ./apps/server/dist
# Die Migrationen werden beim Start angewendet. drizzle-kit ist devDependency und liegt
# hier nicht vor, der generierte Ordner muss deshalb mit ins Image.
COPY --from=build /app/apps/server/drizzle ./apps/server/drizzle
# Das Frontend liefert der Server selbst aus, siehe apps/server/src/routes/statisch.ts.
# Der Pfad ist Teil der Zusage: index.ts sucht es genau eine Ebene ueber apps/server.
COPY --from=build /app/apps/web/dist ./apps/web/dist
# Das Sicherungsskript. Ohne diese Zeile gibt es im Container keinen Weg, die Daten
# konsistent herauszuholen: eine blanke Kopie der SQLite-Datei ist bei WAL nicht sicher.
COPY --from=build /app/apps/server/scripts ./apps/server/scripts

# Das benannte Volume erbt Eigentuemer und Rechte dieses Pfads, wenn es leer angelegt wird.
# Ohne diesen Schritt scheitert der erste Schreibzugriff als Benutzer node mit
# SQLITE_CANTOPEN, was wie ein Treiberfehler aussieht.
RUN mkdir -p /data/attachments && chown -R node:node /data

EXPOSE 3200
USER node
CMD ["node", "apps/server/dist/index.js"]
