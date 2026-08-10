# IDTA-Teilmodellvorlagen

Die drei Dateien daneben sind **unveraenderte** Template-JSONs der Industrial Digital Twin
Association, geholt am 10.08.2026 aus
<https://github.com/admin-shell-io/submodel-templates> (Ordner `published`).

| Datei | Herkunft im IDTA-Repo | IDTA-Nummer |
|---|---|---|
| `nameplate-3-0.json` | `Digital nameplate/3/0/IDTA 02006-3-0_Template_Digital Nameplate.json` | IDTA 02006-3-0 |
| `technicaldata-2-0.json` | `Technical_Data/2/0/IDTA 02003_Template_TechnicalData.json` | IDTA 02003-2-0 |
| `handoverdocumentation-2-0-1.json` | `Handover Documentation/2/0/1/IDTA 02004-2-0-1_Template_HandoverDocumentation__forAASMetamodelV3.1.json` | IDTA 02004-2-0-1 |
| `contactinformation-1-0-1.json` | `Contact Information/1/0/1/IDTA 02002-1-0-1_Template_ContactInformation_forAASMetamodelV3.1.json` | IDTA 02002-1-0-1 |

Bei Handover Documentation und Contact Information ausdruecklich die Fassung
`forAASMetamodelV3.1`: der Editor arbeitet durchgehend auf Metamodell 3.1.

Nameplate und Technical Data stehen bewusst auf ihrer `.0`-Fassung, obwohl es dazu
inzwischen einen Patchstand gibt: ein Fassungswechsel aendert, was `aas_vorlage` ausgibt,
und ist eine eigene Entscheidung. `pnpm vorlagen` meldet den Rueckstand bei jedem Lauf.

**Warum eingecheckt und nicht geholt.** Der Bau braucht dann kein Netz, und eine
Umsortierung der Ordner beim Herausgeber legt ihn nicht lahm. Genau das ist beim Suchen
aufgefallen: die aelteren Fassungen (Nameplate 2.0, Technical Data 1.2, Handover
Documentation 1.2) stehen unter `published` nicht mehr, ihre Ordner antworten mit 404.

**Warum unveraendert.** Die IRDIs sind der ganze Wert dieser Dateien. Sobald jemand darin
von Hand etwas glattzieht, ist die Quelle nicht mehr die Spezifikation, sondern eine
Abschrift davon. Gefiltert wird deshalb erst beim Lesen, in
`src/mcp/vorlagen.ts`, ueber den Qualifier `SMT/Cardinality`, den die Vorlagen selbst
mitbringen.

**Warum ContactInformation dabei ist.** Das Nameplate fuehrt `AddressInformation` als
Pflichtelement, laesst es aber leer und verweist auf ein SMT-Drop-in „Address Information".
Dieses Drop-in liegt beim Herausgeber **nicht als JSON** vor, am 10.08.2026 im ganzen Repo
nachgesehen. Die offiziellen Adressfelder samt IRDI stehen nur in IDTA 02002, dort flach
unter `ContactInformation`. `aas_vorlage` verweist an der leeren Huelle dorthin und sagt
dazu, dass die Quelle eine andere ist. Ohne das wurde genau an dieser Stelle geraten, wovor
die Werkzeugbeschreibung warnt.

## Bekannte Fehler des Herausgebers

Sie stehen so in den Dateien und werden **nicht** ausgebessert, siehe „Warum unveraendert".
`aas_vorlage` gibt sie stattdessen als `bekannteMaengel` mit aus, damit sie niemand
ungeprueft weiterreicht. Die Liste steht in `MAENGEL` in `src/mcp/vorlagen.ts`.

| Datei | Stelle | Fehler |
|---|---|---|
| `technicaldata-2-0.json` | `TechnicalProperties`, `supplementalSemanticIds` | `https://api.eclass-cdp.com/ 0173-1-02-ABK163-002` traegt ein Leerzeichen und ist keine gueltige URL |
| `technicaldata-2-0.json` | `TechnicalProperties`, `displayName` de | „Technsiche Merkmalsbereiche", Schreibfehler |

Zur Aktualisierung eine neue Datei danebenlegen und in `KATALOG` in `src/mcp/vorlagen.ts`
eintragen; die alte bleibt stehen, solange jemand ihre Kennung benutzt. `pnpm vorlagen`
meldet, wenn beim Herausgeber eine neuere steht.

Die Vorlagen stehen unter der Lizenz des Herausgebers (CC BY 4.0, siehe `LICENSE` im
IDTA-Repo). Sie liegen hier als Daten und werden nur gelesen, nie ausgeliefert.
