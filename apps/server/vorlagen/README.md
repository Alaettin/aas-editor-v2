# IDTA-Teilmodellvorlagen

Die drei Dateien daneben sind **unveraenderte** Template-JSONs der Industrial Digital Twin
Association, geholt am 10.08.2026 aus
<https://github.com/admin-shell-io/submodel-templates> (Ordner `published`).

| Datei | Herkunft im IDTA-Repo | IDTA-Nummer |
|---|---|---|
| `nameplate-3-0.json` | `Digital nameplate/3/0/IDTA 02006-3-0_Template_Digital Nameplate.json` | IDTA 02006-3-0 |
| `technicaldata-2-0.json` | `Technical_Data/2/0/IDTA 02003_Template_TechnicalData.json` | IDTA 02003-2-0 |
| `handoverdocumentation-2-0-1.json` | `Handover Documentation/2/0/1/IDTA 02004-2-0-1_Template_HandoverDocumentation__forAASMetamodelV3.1.json` | IDTA 02004-2-0-1 |

Bei Handover Documentation ausdruecklich die Fassung `__forAASMetamodelV3.1`: der Editor
arbeitet durchgehend auf Metamodell 3.1.

**Warum eingecheckt und nicht geholt.** Der Bau braucht dann kein Netz, und eine
Umsortierung der Ordner beim Herausgeber legt ihn nicht lahm. Genau das ist beim Suchen
aufgefallen: die aelteren Fassungen (Nameplate 2.0, Technical Data 1.2, Handover
Documentation 1.2) stehen unter `published` nicht mehr, ihre Ordner antworten mit 404.

**Warum unveraendert.** Die IRDIs sind der ganze Wert dieser Dateien. Sobald jemand darin
von Hand etwas glattzieht, ist die Quelle nicht mehr die Spezifikation, sondern eine
Abschrift davon. Gefiltert wird deshalb erst beim Lesen, in
`src/mcp/vorlagen.ts`, ueber den Qualifier `SMT/Cardinality`, den die Vorlagen selbst
mitbringen.

Zur Aktualisierung eine neue Datei danebenlegen und in `KATALOG` in `src/mcp/vorlagen.ts`
eintragen; die alte bleibt stehen, solange jemand ihre Kennung benutzt.

Die Vorlagen stehen unter der Lizenz des Herausgebers (CC BY 4.0, siehe `LICENSE` im
IDTA-Repo). Sie liegen hier als Daten und werden nur gelesen, nie ausgeliefert.
