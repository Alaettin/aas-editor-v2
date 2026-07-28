# AAS Editor

Web-basierter Editor fuer Asset Administration Shells (AAS) auf Basis der TypeScript-SDKs von
aas-core-works. Import aus JSON, XML und AASX in Metamodell 3.0 und 3.1, Export immer in 3.1,
Validierung gegen die aas-core-Constraints, alles clientseitig im Web Worker.

Stand: Phase 0 bis 2 (Geruest, Kern-Datenmodell, Import und Export). Die Oberflaeche folgt.

## Voraussetzungen

Node 22 oder neuer, pnpm 10, Docker fuer das Deployment.

## Einrichtung

```bash
pnpm install
cp .env.example .env     # Zugangsdaten und Session-Secret setzen
pnpm test-data           # offizielle aas-core-Testdaten holen, noetig fuer die Tests
```

## Entwicklung

```bash
pnpm dev          # Frontend auf http://localhost:5273
pnpm dev:server   # Backend auf http://localhost:3200
```

## Pruefen

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm budget       # initiales JavaScript gegen das 250-KB-gzip-Budget
```

## Betrieb

```bash
docker compose up -d --build
curl http://localhost:8080/api/health
```

`AAS_EDITOR_DOMAIN` in der `.env` auf die echte Domain setzen, dann besorgt Caddy das
HTTPS-Zertifikat selbst. Die SQLite-Datei und die Anhaenge liegen im Volume `aas-data`,
ein Backup ist ein Kopiervorgang dieses Volumes.

## Aufbau

```
packages/core     Domaenenlogik, DOM-frei und worker-tauglich
apps/web          React 19, Vite 8, Tailwind 4
apps/server       Fastify 5, SQLite via Drizzle
scripts/          Testdaten holen, Bundle-Budget pruefen
```

Konventionen und Stolperfallen stehen in [CLAUDE.md](CLAUDE.md).
