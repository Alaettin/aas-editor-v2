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
| `aas_vorlage` | Geruest eines IDTA-Teilmodells mit den korrekten semanticId-Werten |
| `aas_pruefen` | Befunde aus `verification.verify()` samt Regelkennung und Pfad, dazu eine Bilanz der Anhaenge |
| `aas_datei_erzeugen` | Schreibt JSON, XML oder AASX samt Anhaengen und gibt einen Link, der eine Stunde gilt |
| `aas_datei_lesen` | Liest eine vorhandene AAS (auch 3.0) als Environment 3.1 zurueck, samt Anhaengen |

### Anhaenge

Ein AASX ohne seine Dateien ist fuer eine HandoverDocumentation wertlos. `aas_datei_erzeugen`
nimmt deshalb `anhaenge` entgegen, je Eintrag einen Paketpfad und **genau eine** Quelle:

| Quelle | Wofuer |
|---|---|
| `url` | der Regelfall bei Herstellerdokumenten, nur `https` |
| `base64` | kleine Bilder aus dem Chat, bis 2 MB |
| `token` | alles andere: zuvor ueber `POST /api/mcp/anhaenge` hochladen |

```bash
curl -s -X POST http://localhost:3200/api/mcp/anhaenge -F datei=@datenblatt.pdf
```

Zeigt `assetInformation.defaultThumbnail` auf einen dieser Pfade, landet die Vorschau
zusaetzlich als Paket-Thumbnail in der Wurzel: der AASX Package Explorer sucht sie dort,
ein Repository ueber `defaultThumbnail`, und beide Wege sollen bedient sein.

Grenzen: 25 MB je Datei, 100 MB je Container, hoechstens 25 Anhaenge, Content-Type gegen
eine Positivliste. Ein Abruf ueber `url` geht nur an oeffentliche Adressen; private,
Loopback- und Link-local-Bereiche sind gesperrt, auch nach einer Weiterleitung
(`src/mcp/netz.ts`).

### AASX-Konformitaet

Der Container folgt [IDTA-01005-3-2](https://industrialdigitaltwin.org/en/content-hub/aasspecifications)
(Part 5, Package File Format): `aasx/aasx-origin` als Einstiegspunkt, dessen Beziehung an
der Paketwurzel haengt, `aas-spec` von der Origin-Datei aus, `aas-suppl` von der
Spec-Datei aus, Thumbnail ueber die OPC-Beziehung, MIME-Typ `application/aas+zip`,
Spec-Datei als `aasx/data.xml` nach der Namenskonvention.

Festgehalten wird das von `packages/core/test/aasx-konformitaet.test.ts`, und zwar an den
**ausgepackten Bytes**, nicht ueber die API von `aas-package3-typescript`. Geschrieben
wird das Paket naemlich von dieser fremden Bibliothek; ein Update koennte die Konformitaet
sonst still brechen, und aufgefallen waere es erst beim Partner, der das Paket nicht mehr
oeffnen kann.

Nicht umgesetzt, weil in der Spezifikation bedingt oder optional: digitale Signaturen
(„required if you need to sign files"), Core-Properties und mehrere Serialisierungen
parallel im selben Paket.

### IDTA-Vorlagen

`aas_vorlage` liefert das Geruest eines Teilmodells nach IDTA. Die drei Vorlagen liegen
unveraendert unter [apps/server/vorlagen/](apps/server/vorlagen/), Herkunft im README
daneben. Gefiltert wird beim Lesen ueber den Qualifier `SMT/Cardinality`, den die Vorlagen
selbst mitbringen: `umfang: "pflicht"` (Vorgabe) liefert nur One und OneToMany,
`vollstaendig` die ganze Vorlage samt `conceptDescriptions`.

```bash
pnpm vorlagen     # meldet, wenn die IDTA eine neuere Fassung veroeffentlicht hat
```

Zur Laufzeit fragt der Server beim Herausgeber **nichts** nach. Die Pruefung ist ein
Handgriff, kein Automatismus, und haengt bewusst nicht an der CI.

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

**Der Zugang ist nicht abgesichert.** Wer die Adresse kennt, kann pruefen, umwandeln,
Dateien erzeugen und Anhaenge hochladen; Projekte, deren Anhaenge und die Einstellungen
sind nicht erreichbar, die Werkzeuge sehen `db` gar nicht. Fuer claude.ai braucht es
ohnehin OAuth: feste Bearer-Token nimmt dort nur ein Beta-Feld entgegen, das nicht bei
jedem freigeschaltet ist.

Erzeugte Dateien liegen unter `DATA_DIR/mcp-ausgabe`, hochgeladene unter
`DATA_DIR/mcp-anhaenge`. Beide leben eine Stunde und werden beim Start und bei jedem
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
