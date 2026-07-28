# Metamodell-Diff AAS 3.0 gegen 3.1

Grundlage des Upgrade-Mappers in `packages/core/src/upgrade/v30ToV31.ts`.
Jede Zeile dieser Tabelle ist durch einen Test in `packages/core/test/upgrade.test.ts` belegt.

## Wie dieser Diff entstanden ist

Nicht aus Fliesstext, sondern aus den beiden generierten SDKs. Sie werden von
aas-core-codegen unmittelbar aus der jeweiligen Spezifikation erzeugt, sind also die
genaueste maschinenlesbare Fassung des Metamodells, die verfuegbar ist.

Verglichen wurden am 28.07.2026:

- `@aas-core-works/aas-core3.0-typescript@1.0.5` gegen
  `@aas-core-works/aas-core3.1-typescript@1.0.1`
- Klassen-, Enum- und Interface-Bestand aus `dist/types/types.d.ts`
- Eigenschaften je Klasse und Werte je Enum aus derselben Datei
- Constraint-Kennungen aus `dist/lib/cjs/verification.js`
- XML-Namensraum aus `dist/lib/cjs/xmlization.js` beziehungsweise den offiziellen Testdaten

## Befund

**Der Abstand ist klein und rein additiv.** 3.0 nach 3.1 ist verlustfrei moeglich,
es geht kein Datum verloren und es muss kein Feld umgerechnet werden.

| Nr. | Bereich | 3.0 | 3.1 | Folge fuer den Mapper |
|---|---|---|---|---|
| 1 | Klassenbestand | 59 Klassen, Enums und Interfaces | dieselben 59 | Keine. Kein Umbenennen, kein Wegfall, kein Zugang. |
| 2 | Eigenschaften je Klasse | identisch | identisch | Keine. Kein Feld muss verschoben oder umbenannt werden. |
| 3 | `AssetKind` | `Instance`, `Type`, `NotApplicable` | zusaetzlich `Role` | Rein additiv. Jeder 3.0-Wert bleibt gueltig. Nur der Rueckweg 3.1 nach 3.0 waere verlustbehaftet, und den gibt es nicht. |
| 4 | Constraint AASd-090 | vorhanden: `category` eines DataElement muss CONSTANT, PARAMETER oder VARIABLE sein | entfallen | 3.0-Daten koennen nur strenger sein als 3.1 verlangt. Keine Bereinigung noetig. `category` ist seit 3.0 ohnehin als veraltet gekennzeichnet. |
| 5 | Constraint AASd-120 | vorhanden: direkte Kinder einer `SubmodelElementList` duerfen keinen `idShort` tragen | entfallen | 3.1 erlaubt den `idShort` dort. Ein 3.0-Bestand hat ihn nie gesetzt, das bleibt gueltig. Der Editor darf ihn in 3.1 anbieten. |
| 6 | Constraint AASc-3a-002 | so benannt | heisst `AASc-002`, Text unveraendert | Betrifft nur die Anzeige von Constraint-Kennungen, nicht die Daten. Uebersetzungstabelle der Validierung beachten. |
| 7 | XML-Namensraum | `https://admin-shell.io/aas/3/0` | `https://admin-shell.io/aas/3/1` | Der einzige Eingriff, den ein 3.0-Import tatsaechlich braucht. Siehe unten. |
| 8 | JSON-Versionsmarker | keiner | keiner | Die Formaterkennung kann die Version aus JSON **nicht** ablesen. JSON wird deshalb direkt mit 3.1 gelesen, ein Fehlschlag ist der Anlass, es mit 3.0 zu versuchen. |

## Was daraus folgt

**JSON.** Ein 3.0-JSON ist strukturell ein gueltiges 3.1-JSON. Der Import liest es direkt
mit der 3.1-SDK. Die 3.0-SDK wird nur dann dynamisch nachgeladen, wenn das misslingt, um
eine praezise Fehlermeldung zu bekommen. Gemessen an Zeile 1 bis 3 kann das nur bei
kaputten Daten passieren, nicht wegen der Version.

**XML.** Hier reicht das nicht, weil der Namensraum im Dokument steht und die 3.1-SDK ein
3.0-Dokument deshalb ablehnt. Der Mapper ersetzt den Namensraum und liest danach mit der
3.1-SDK. Das ist zulaessig, weil Element- und Attributnamen aus denselben Klassen- und
Eigenschaftsnamen erzeugt werden und diese laut Zeile 1 und 2 identisch sind.

**Die 3.0-TypeScript-SDK bringt gar kein `xmlization` mit.** Ihre Subpath-Exports sind nur
`types`, `jsonization`, `stringification` und `verification`. Ein 3.0-XML ueber die 3.0-SDK
zu lesen ist also technisch nicht moeglich, der Namensraum-Tausch ist nicht die bequeme,
sondern die einzige Loesung.

**Bundle-Folge.** Weil der 3.0-Pfad damit fast nie gebraucht wird, laedt der Editor die
3.0-SDK erst, wenn ein 3.1-Parse fehlgeschlagen ist. Das spart die rund 100 KB gzip aus
Plan Abschnitt 10 im Regelfall vollstaendig.

## Nicht geprueft

Textliche Praezisierungen der Spezifikation, die weder Klassen noch Constraints beruehren
(Beschreibungen, Beispiele, Anmerkungen), sind hier nicht erfasst. Sie aendern die Daten
nicht und damit auch nicht den Mapper.
