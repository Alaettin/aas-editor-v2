# Leistung: gemessen, nicht behauptet

Plan Abschnitt 10 nennt fuenf Zahlen. Dieser Bericht sagt, wie sie gemessen wurden, was
dabei herauskam, und was offen bleibt. Stand: Phase 9.

## Verfahren

**Modell.** `pnpm modell` erzeugt deterministisch ein gueltiges AAS-Environment mit
10.082 Elementen (1,2 MB JSON): eine Verwaltungsschale, neunzehn Teilmodelle mit
verschachtelten Sammlungen, fuenfzig ConceptDescriptions, dazu **eine** Sammlung mit
zweitausend gleichrangigen Kindern. Die breite Sammlung ist Absicht: an ihr faellt auf, ob
irgendwo je Zeile ueber alle Geschwister gelaufen wird.

Dass das Modell metamodellkonform ist, prueft `apps/web/test/leistung.test.ts` bei jedem
Lauf mit. An einem ungueltigen Modell zu messen hiesse, Fehlerpfade zu messen.

**Werkzeuge.**

- `pnpm leistung` misst im Node-Lauf, was auf dem Hauptthread und im Worker rechnet.
- `pnpm e2e` misst im Browser, was sich nur dort zeigt: erster Bildaufbau, der Weg vom
  Tastendruck bis zum gezeichneten Zeichen, Rahmenabstaende beim Rollen.
- `pnpm budget` misst das initiale JavaScript und, seit Phase 9, getrennt davon das
  Stylesheet. Die Bruchstuecke des Workers werden aufgelistet, aber nicht begrenzt.

**Geraet.** Intel Core i9-10900KF, 32 GB, Node 24, Chromium ueber Playwright, Vite im
Entwicklungsbetrieb auf localhost. Die absoluten Zahlen haengen daran; die Verhaeltnisse
vorher zu nachher nicht.

## Die fuenf Zusagen

| Zusage aus Abschnitt 10                     | vor Phase 9 | nach Phase 9 |       Grenze |
| ------------------------------------------- | ----------: | -----------: | -----------: |
| Initiales JavaScript, gzip                  |      157 KB |   **145 KB** |       250 KB |
| Erster Bildaufbau                           |      428 ms |   **308 ms** |      1500 ms |
| Tastendruck bis zum Zeichen, 95. Perzentil  |       87 ms |    **18 ms** |        50 ms |
| Rollen im Baum, Rahmenabstand 95. Perzentil |       33 ms |    **17 ms** | ohne Stocken |
| Validierung blockiert die Eingabe           |        nein |     **nein** |          nie |

Alle fuenf sind eingehalten. Der Tastendruck lag vorher um 74 Prozent ueber der Zusage,
das Rollen lief durchgehend mit 30 statt 60 Bildern.

## Was einzeln gemessen wurde

Zehntausend Elemente, Median aus mehreren Laeufen.

|                                   |  vorher |    nachher |
| --------------------------------- | ------: | ---------: |
| `buildRows`, alles aufgeklappt    |  161 ms | **7,7 ms** |
| `buildCensus`                     |  5,4 ms | **3,4 ms** |
| `buildIssueCounts`                |  0,0 ms |     0,0 ms |
| `applyChange`, ein Feld           |  5,0 ms |     4,7 ms |
| `denormalize`                     |  1,9 ms |     1,6 ms |
| `toAasCore`                       |  5,8 ms |     5,8 ms |
| `validate` (im Worker)            | 62,9 ms |    58,4 ms |
| Tastendruck, blockierender Anteil |   86 ms | **1,6 ms** |

Die Ursachen, in der Reihenfolge ihres Gewichts:

1. **Die Zeilen des Baums liefen quadratisch.** `disambiguatorOf` durchsuchte je Zeile die
   ganze Geschwisterliste. In der Sammlung mit zweitausend Kindern sind das vier Millionen
   Zugriffe je Baumaufbau. Die Haeufigkeit je `idShort` wird jetzt einmal gezaehlt.
2. **Vier Feldarten schrieben bei jedem Zeichen ins Modell** und loesten damit je
   Tastendruck den ganzen Aenderungsweg aus. `TextEditor` hatte das Entwurfsmuster von
   Anfang an; es steht jetzt als `useEntwurf` einmal da und traegt alle fuenf.
3. **Das `memo` am Baum war wirkungslos.** Zwei Rueckrufe standen als Literale im JSX,
   also bekam jede sichtbare Zeile bei jedem Durchlauf neue Eigenschaften.
4. **`measureElement` hing an jeder Zeile**, obwohl die Zeilenhoehe fest in `--row-height`
   steht. Ein ResizeObserver je Zeile, und beim Rollen die teuerste Last von allen.
5. **`buildCensus` ging ueber einen Generator**, obwohl es die Baumordnung nicht braucht.
6. **`countNodes` lief je Aenderung**, nur um ein Feld eines Entwurfs zu fuellen, der
   meist verworfen wird. Jetzt hinter der Entprellung.

## Was nicht das Problem war

Der Verdacht lag auf dem Buendel und auf der Validierung. Beides stimmte nicht.

- **Das Bundle** lag mit 157 KB schon vorher weit unter der Grenze. Die 145 KB kommen
  daher, dass die Projektliste samt AlertDialog im Startgraphen lag, obwohl die erste
  Seite die Anmeldung ist. Sie laedt jetzt wie der Editor erst beim Betreten.
- **Die Validierung** braucht 58 ms, nicht die vermuteten mehreren hundert. Sie laeuft im
  Worker und blockiert nichts.

Die 250-KB-Grenze war damit nie die bindende. Die eigentlichen Kosten lagen in Schleifen,
die niemand als Schleife gesehen hat.

## Was offen bleibt

Ehrlich benannt, nicht beschoenigt:

- **Die Validierung ist nicht inkrementell.** Je Lauf wird die gesamte Umgebung zweimal
  neu aufgebaut: `denormalize` erzeugt das JSON, `environmentFromJsonable` daraus die
  SDK-Objekte. Bei zehntausend Elementen sind das die gemessenen 58 ms, bei hunderttausend
  waeren es entsprechend mehr. Abgefedert ist es durch die Entprellung, die sich an der
  gemessenen Dauer des letzten Laufs orientiert, und dadurch, dass ueberholte Ergebnisse
  verworfen werden. Eine echte Teilbaum-Validierung stuende an, sobald Modelle dieser
  Groesse der Regelfall werden.
- **elkjs bringt 456 KB gzip mit**, mehr als das gesamte Startbundle. Es liegt im Worker
  und laedt erst beim ersten Graphlayout, faellt also unter keine Grenze. Sichtbar ist es
  jetzt trotzdem: `pnpm budget` listet die Worker-Bruchstuecke auf.
- **`applyChange` kostet 4,7 ms** und laesst sich mit dem heutigen Modellaufbau kaum
  senken: Immer kopiert die Wirbelsaeule, und dazu gehoert eine flache Ablage mit
  zehntausend Schluesseln. Das faellt nicht auf, seit kein Tastendruck mehr eine Aenderung
  ausloest; bei zweitausend Aenderungen am Stueck sind es zehn Sekunden. Eine `Map` statt
  eines Objekts waere der Hebel, aber ein Eingriff in das Kernmodell.
- **Der erste Bildaufbau ist am Entwicklungsserver gemessen**, nicht am ausgelieferten
  Bau. Der ausgelieferte ist schneller, nicht langsamer; die Zahl ist also eine obere
  Schranke.

## Nebenbei gehaerte Stellen

Beim Messen mit zehntausend Elementen fiel dreierlei auf, das nicht die Oberflaeche
betrifft:

- `insertIdentifiables` fuegte alle Zeilen in **einer** SQL-Anweisung ein. SQLite bindet je
  Anweisung hoechstens 32.766 Werte, bei sechs Spalten also rund 5.400 Zeilen. Darueber
  antwortete der Server mit 500. Jetzt in Bloecken zu zweihundert; ein Test mit achttausend
  Teilmodellen belegt es.
- Dieselbe Grenze traf das `inArray` ueber die Anhangspfade.
- `createVersion` packte mit `gzipSync` auf dem Ereignisfaden und hielt damit den ganzen
  Server an. Jetzt asynchron im Threadpool.

## Erneut messen

```
pnpm modell          # Testmodell erzeugen, einmalig
pnpm leistung        # Node-Lauf mit allen Einzelzeiten
pnpm e2e             # Browser: Bildaufbau, Tippen, Rollen, dazu axe
pnpm budget          # JavaScript, Stylesheet, Worker
```

Die Grenzen in `apps/web/test/leistung.test.ts` liegen bei etwa dem Dreifachen der
gemessenen Werte. Sie sollen nicht die Tagesform der Maschine bewerten, sondern auffangen,
wenn wieder jemand einen Lauf ueber alle Knoten in den Tippweg legt.
