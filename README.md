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

## MCP-Zugang

Unter `POST /api/mcp` liegt ein MCP-Server (Streamable HTTP, zustandslos). Er ist eine
**Werkbank, kein Fernzugriff**: er kennt weder Projekte noch Benutzer noch die Datenbank.
Gedacht ist er fuer „bau mir eine AAS mit den und den Teilmodellen fuer dieses Produkt"
im Chat, ueber mehrere Runden, am Ende faellt eine Datei heraus.

| Werkzeug | Was es tut |
|---|---|
| `aas_schema` | Felder einer Art samt Pflichtangaben, Aufzaehlungswerten und gueltigem Geruest |
| `aas_pruefen` | Befunde aus `verification.verify()` samt Regelkennung und Pfad |
| `aas_datei_erzeugen` | Schreibt JSON, XML oder AASX und gibt einen Link, der eine Stunde gilt |
| `aas_datei_lesen` | Liest eine vorhandene AAS (auch 3.0) als Environment 3.1 zurueck |

Anbinden:

```bash
claude mcp add --transport http axon-editor http://localhost:3200/api/mcp
```

Nachsehen, ob er antwortet:

```bash
curl -s -X POST http://localhost:3200/api/mcp \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

**Der Zugang ist nicht abgesichert.** Wer die Adresse kennt, kann pruefen, umwandeln und
Dateien erzeugen; Projekte, Anhaenge und Einstellungen sind nicht erreichbar, die
Werkzeuge sehen `db` gar nicht. Solange das so ist, gehoert der Zugang nicht ins offene
Netz. Fuer claude.ai braucht es ohnehin OAuth: feste Bearer-Token nimmt dort nur ein
Beta-Feld entgegen, das nicht bei jedem freigeschaltet ist.

Erzeugte Dateien liegen unter `DATA_DIR/mcp-ausgabe` und werden beim Start und bei jedem
Ablegen weggeraeumt.

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
docker compose ps                       # der Healthcheck muss "healthy" zeigen
curl -k https://localhost:8443/api/health
```

Der Server liefert das gebaute Frontend selbst aus, es gibt also **einen** Dienst plus
Caddy davor. `AAS_EDITOR_DOMAIN` in der `.env` auf die echte Domain setzen, dann besorgt
Caddy das HTTPS-Zertifikat selbst; lokal steht dort `localhost`, und Caddy stellt sich ein
eigenes aus (daher das `-k` oben und die Warnung im Browser).

**HTTPS ist im Container nicht optional.** Compose setzt `NODE_ENV=production`, damit
traegt das Sitzungscookie `secure`, und ueber `http://` verwirft der Browser es
kommentarlos: die Anmeldung liefe dann in eine Schleife.

Die SQLite-Datei und die Anhaenge liegen im Volume `aas-data`. Zum Sichern **nicht**
einfach kopieren: bei WAL steht der juengste Stand teils in der `-wal`-Datei.

```bash
docker compose exec app node apps/server/scripts/backup.mjs
docker compose cp app:/data/backups ./sicherung
```

## Aufbau

```
packages/core     Domaenenlogik, DOM-frei und worker-tauglich
apps/web          React 19, Vite 8, Tailwind 4
apps/server       Fastify 5, SQLite via Drizzle, MCP-Zugang unter src/mcp
scripts/          Testdaten holen, Bundle-Budget pruefen
```

Konventionen und Stolperfallen stehen in [CLAUDE.md](CLAUDE.md).
