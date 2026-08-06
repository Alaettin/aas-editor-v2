# AXON Studio

Web-basierter Editor fuer Asset Administration Shells (AAS) auf Basis der TypeScript-SDKs von
aas-core-works. Import aus JSON, XML und AASX in Metamodell 3.0 und 3.1, Export immer in 3.1,
Validierung gegen die aas-core-Constraints, alles clientseitig im Web Worker.

Stand: Phase 0 bis 8. Oberflaeche in der AXON-Farbwelt mit Werkzeugleiste, Explorer und
Formular, Live-Validierung, dazu Anmeldung und Projekte auf dem Server samt Anhaengen. Die
Graphsicht ist abgeschaltet und wird ueberarbeitet, die Tabellensicht ist entfallen. Der
KI-Assistent ist als Oberflaeche vorhanden, aber **noch nicht angebunden** und sagt das an
jeder Stelle.

## Anmeldung und Projekte

Ein einzelner Benutzer, Zugangsdaten in der `.env` (`AUTH_USERNAME`, `AUTH_PASSWORD`,
`SESSION_SECRET`). Keine Benutzertabelle, keine Registrierung: das ist ein Platzhalter hinter
dem `AuthProvider`-Interface in `apps/server/src/auth/provider.ts` und wird spaeter ausgetauscht,
ohne dass eine Route sich aendert.

Nach der Anmeldung fuehrt `/projekte` die gespeicherten Staende. Ein Projekt entsteht leer oder
aus einer vorhandenen Datei. Gespeichert wird ueber die Werkzeugleiste, und zwar
ueberschreibend: laeuft ein zweiter Tab mit, gewinnt der letzte Schreibvorgang. Eine
Versionierung gibt es bewusst nicht.

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
pnpm budget       # initiales JavaScript und Stylesheet gegen ihre Budgets
pnpm e2e          # Browserabnahme: Oberflaeche, Barrierefreiheit, gemessene Zeiten
```

Beim ersten `pnpm e2e` einmal `pnpm exec playwright install chromium` ausfuehren.

Fuer die Leistungsmessung braucht es ein grosses Testmodell. Es wird nicht eingecheckt:

```bash
pnpm modell       # erzeugt test-data/gross/modell-10000.json, einmalig
pnpm leistung     # misst Baum, Aenderungsweg, Umwandlung und Validierung
```

Die gemessenen Zahlen und was offen bleibt: [docs/leistung.md](docs/leistung.md).

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
