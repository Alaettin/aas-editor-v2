# AXON Editor: Projektkonventionen

**Der Editor heisst seit dem 07.08.2026 AXON Editor** und liegt auf
`axon-editor.sliplane.app`. Den Namen AXON Studio traegt jetzt der **Hub**
(`...\Claude\AXON Studio`, `axon-studio.sliplane.app`), der zugleich der
Identitaetsanbieter dieses Editors ist. Repo, Ordner und Paketnamen (`@aas-editor/*`)
heissen weiterhin `aas-editor`.

**Die Anmeldung laeuft ueber den Hub** (`AUTH_MODE=oidc`). `passwort` bleibt die
Rueckfallebene in den Diensteinstellungen: geht am Hub etwas schief, ist der Editor sonst
fuer niemanden mehr erreichbar. Die ganze Logik liegt hinter `AuthProvider`; das ID-Token
prueft `auth/oidc.ts` selbst, ohne JOSE-Bibliothek.

Web-basierter Editor fuer Asset Administration Shells auf Basis der TypeScript-SDKs von
aas-core-works. Die vollstaendige Umsetzungsvorgabe (Ziel, Architektur, Phasen 0 bis 9, Abnahmen)
liegt in Obsidian unter `01 Projekte/02 Arbeit/01 AAS Editor/Plan.md` und ist maszgeblich. Dieses Dokument
haelt nur fest, was beim Schreiben von Code taeglich greift.

## Aufbau

| Ort | Inhalt |
|---|---|
| `packages/core` | Domaenenlogik: normalisiertes Modell, SDK-Adapter, Upgrade 3.0 nach 3.1, Import und Export |
| `apps/web` | React 19, Vite 8, Tailwind 4, Worker-Bruecke |
| `apps/server` | Fastify 5, SQLite via Drizzle |
| `scripts/` | Testdaten holen, Bundle-Budget pruefen |

## Harte Regeln

1. **`packages/core` bleibt DOM-frei, React-frei und Node-frei.** Es laeuft im Web Worker, im
   Browser und im Backend. ESLint erzwingt das (`no-restricted-imports`, `no-restricted-globals`).
2. **Nie den Wurzelimport der SDK.** Immer Subpath-Exports:
   `@aas-core-works/aas-core3.1-typescript/types`, `/jsonization`, `/xmlization`, `/verification`,
   `/stringification`. Der Wurzelimport zieht alle Module herein und sprengt das Bundle-Budget.
3. **`xmlization` (475 KB roh) und die gesamte 3.0-SDK nur dynamisch importieren.**
   `verification` (213 KB) lebt ausschliesslich im Worker.
4. **Initiales JavaScript unter 250 KB gzip.** `pnpm budget` prueft das, die CI bricht sonst ab.
5. **Deserialisierer werfen nicht.** Sie geben ein "either" zurueck. Immer `result.error` pruefen,
   nie blind `result.mustValue()` aufrufen.
6. **Eindeutigkeit von Identifiables nur auf `id` pruefen, niemals auf `idShort`.**
   Constraint AASd-022 gilt nur fuer non-identifiable Referables. Zwei Submodels mit gleichem
   `idShort` und verschiedener `id` sind gueltig, nicht einmal eine Warnung.
7. **Validierung kommt ausschliesslich aus `verification.verify()`.** Keine handgeschriebenen
   Metamodell-Regeln. Zusaetzliche Datenwarnungen (fehlender Anhang, doppelte `id`) sind klar als
   Warnung zu kennzeichnen, nicht als Constraint.
8. **Identifiables liegen in der Datenbank einzeln, eine Zeile je Shell, Submodel und
   ConceptDescription**, adressierbar ueber ihre fachliche `id`. Kein Blob je Projekt: nur so
   kann der Editor spaeter ein einzelnes Submodel nach IDTA-01002 ausliefern. Blob ist allein
   der Versionsschnappschuss.
9. **Anmeldelogik ausschliesslich in `apps/server/src/auth/provider.ts`.** Routen sehen nur
   `requireAuth` und `app.auth`. Ein Wechsel auf OIDC darf keine Route anfassen muessen.
10. **Kein Push ohne ausdrueckliche Ansage.**

## Stolperfallen der SDK

- Der ESM-Build importiert **endungslos** (`./common` statt `./common.js`) und ist unter nativem
  Node-ESM nicht ladbar. Loesung im Repo: die Pakete laufen durch die Vite-Pipeline, in Vitest
  ueber `server.deps.inline` (`packages/core/vitest.config.ts`), im Server ueber das
  esbuild-Bundle (`apps/server/build.mjs`). Nie ungebuendelt an Node durchreichen.
- Die XML-Funktion heisst `xmlization.fromXmlString`, **nicht** `environmentFromXmlString`.
- `aas-package3-typescript` wird **ohne** `@aas-core-works/`-Praefix installiert.
- `File`-Elemente tragen nur einen Paketpfad, nicht den Inhalt. Ohne die zweite
  Pfad-auf-Bytes-Map gehen beim AASX-Roundtrip alle Anhaenge verloren.
- **Das AASX-Paket schreibt eine fremde Bibliothek, die Konformitaet haelt ein eigener
  Test.** `packages/core/test/aasx-konformitaet.test.ts` prueft IDTA-01005-3-2 an den
  ausgepackten Bytes: jede Beziehung samt ihrer Quelle, den Origin-Inhalt, die
  Content-Types und den MIME-Typ `application/aas+zip`. Wer `io/aasx.ts` anfasst, faellt
  dort auf.

## Befehle

```
pnpm install
pnpm test-data      # offizielle aas-core-Testdaten nach ./test-data holen
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm budget         # Bundle-Budget pruefen, braucht einen vorherigen Build
pnpm dev            # Frontend
pnpm dev:server     # Backend
```

## Stil

- Oberflaechensprache Deutsch ueber react-i18next, AAS-Fachbegriffe bleiben unuebersetzt.
- Keine Gedankenstriche in generierten Texten und Kommentaren.
- Design-Tokens ausschliesslich aus `apps/web/src/styles/tokens.css`, keine Einzelwerte im Code.
- **Farben und Schriften folgen AXON**: Core Blue `#1C5DB3` (AssetAdministrationShell),
  PF Green `#00A587` (Submodel), Nova Violet `#8D3CC6` (ConceptDescription), Sunrise Orange
  `#F77039` (Befunde). Raleway traegt nur Wortmarke und Formulartitel, IBM Plex Sans die
  Oberflaeche, IBM Plex Mono alle Kennungen und Zahlen. Die Werte stehen als Hex in
  `tokens.css` und werden nicht berechnet, sie sind Markenvorgabe.
- **Der Typfarbcode ist ein System**: `lib/typeOf.ts` ist die einzige Abbildung Typ auf Ton,
  in keiner Sicht steht ein eigenes `switch`. Chips laufen ueber `ui/chip.tsx`, nicht ueber
  eigene Spans.
- **Befunde sind orange, nicht rot.** Rot bleibt destruktiven Aktionen vorbehalten. Gefuellt
  heisst Constraint, weich heisst Datenwarnung.
