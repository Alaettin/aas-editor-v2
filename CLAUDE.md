# AAS Editor: Projektkonventionen

Web-basierter Editor fuer Asset Administration Shells auf Basis der TypeScript-SDKs von
aas-core-works. Die vollstaendige Umsetzungsvorgabe (Ziel, Architektur, Phasen 0 bis 9, Abnahmen)
liegt in Obsidian unter `01 Projekte/03 AAS Editor/Plan.md` und ist maszgeblich. Dieses Dokument
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
8. **Kein Push ohne ausdrueckliche Ansage.**

## Stolperfallen der SDK

- Der ESM-Build importiert **endungslos** (`./common` statt `./common.js`) und ist unter nativem
  Node-ESM nicht ladbar. Loesung im Repo: die Pakete laufen durch die Vite-Pipeline, in Vitest
  ueber `server.deps.inline` (`packages/core/vitest.config.ts`), im Server ueber das
  esbuild-Bundle (`apps/server/build.mjs`). Nie ungebuendelt an Node durchreichen.
- Die XML-Funktion heisst `xmlization.fromXmlString`, **nicht** `environmentFromXmlString`.
- `aas-package3-typescript` wird **ohne** `@aas-core-works/`-Praefix installiert.
- `File`-Elemente tragen nur einen Paketpfad, nicht den Inhalt. Ohne die zweite
  Pfad-auf-Bytes-Map gehen beim AASX-Roundtrip alle Anhaenge verloren.

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
