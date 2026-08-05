# AAS Editor

Web-basierter Editor fuer Asset Administration Shells (AAS) auf Basis der TypeScript-SDKs von
aas-core-works. Import aus JSON, XML und AASX in Metamodell 3.0 und 3.1, Export immer in 3.1,
Validierung gegen die aas-core-Constraints, alles clientseitig im Web Worker.

Stand: Phase 0 bis 8. Oberflaeche in der AXON-Farbwelt mit Menuezeile,
Explorer, Formular, Tabelle und Graph, Live-Validierung, dazu Anmeldung und Projekte auf dem
Server samt Versionen und Anhaengen. Der KI-Assistent ist als Oberflaeche vorhanden, aber
**noch nicht angebunden** und sagt das an jeder Stelle.

## Anmeldung und Projekte

Ein einzelner Benutzer, Zugangsdaten in der `.env` (`AUTH_USERNAME`, `AUTH_PASSWORD`,
`SESSION_SECRET`). Keine Benutzertabelle, keine Registrierung: das ist ein Platzhalter hinter
dem `AuthProvider`-Interface in `apps/server/src/auth/provider.ts` und wird spaeter ausgetauscht,
ohne dass eine Route sich aendert.

Nach der Anmeldung fuehrt `/projekte` die gespeicherten Staende. Ein Projekt entsteht leer oder
aus einer vorhandenen Datei. Gespeichert wird ueber die Kopfleiste; laeuft dabei ein zweiter Tab
mit, meldet der Server einen Konflikt statt zu ueberschreiben. Der Versionsverlauf legt
komprimierte Schnappschuesse an und holt sie zurueck.

Identifiables liegen einzeln in der Datenbank, adressierbar ueber ihre base64url-kodierte `id`:

```bash
curl --cookie "aas_sitzung=..." \
  http://localhost:3200/api/projects/<projektId>/submodels/<kodierte-id>
```

Das ist die Vorbereitung auf die Ausbaustufe "Submodel Repository" nach IDTA-01002.

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
pnpm e2e          # Browserabnahme der Oberflaeche, braucht laufende Entwicklungsserver
```

Beim ersten `pnpm e2e` einmal `pnpm exec playwright install chromium` ausfuehren.

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
