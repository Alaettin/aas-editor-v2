/**
 * Die Geometrie des AXON-Keyvisuals: chaotische Stroeme laufen von links in einen Knoten
 * und verlassen ihn als geordnete Schienen nach rechts.
 *
 * Bewusst rein rechnend, ohne DOM und **ohne jede Farbe**. Stroeme und Schienen tragen
 * Rollennamen, die Farbe kommt erst beim Zeichnen aus den Tokens. Damit laesst sich die
 * Aussage des Bildes unter Node testen, und im Komponentencode steht kein Einzelwert.
 */

export const SZENE = {
  /** Entwurfsbreite, alle Koordinaten beziehen sich darauf */
  W: 1600,
  H: 900,
  /** Mittellinie: hier laufen alle Stroeme zusammen */
  CY: 450,
  /** x-Position des Knotens */
  NODE: 540,
  /** Wie weit die Stroeme links aus dem Bild laufen */
  EINLAUF: 120,
} as const;

/**
 * Zeitpunkt des Standbildes fuer reduzierte Bewegung. Fest gewaehlt, nicht null: bei
 * `zeit = 0` liegen alle Phasen nackt beieinander und das Bild wirkt gerechnet.
 */
export const STANDBILD_ZEIT = 7.5;

export type Kanal = "pink" | "violett" | "cyan" | "orange";
export type Schienenton = "a" | "b";

export interface Strom {
  readonly kanal: Kanal;
  /** Zeichenreihenfolge: hoeher liegt weiter oben */
  readonly z: number;
  readonly breite: number;
  readonly base: number;
  readonly amp: number;
  readonly f1: number;
  readonly f2: number;
  readonly p1: number;
  readonly p2: number;
  readonly s1: number;
  readonly s2: number;
  readonly drift: number;
  readonly bias: number;
}

export interface Schiene {
  readonly y: number;
  /** x, ab dem die Schiene die Mittellinie verlaesst */
  readonly split: number;
  /** Laenge des Bogens */
  readonly run: number;
  readonly ton: Schienenton;
}

export const MIN_STROEME = 6;
export const MAX_STROEME = 28;

/** Abstaende der Schienen von der Mittellinie, nach oben und unten gespiegelt. */
const SCHIENEN_ABSTAENDE = [45, 122, 205, 292, 378] as const;

export function klemme(wert: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, wert));
}

/**
 * Die Stroeme. Deterministisch: die Streuung kommt aus dem goldenen Schnitt, nicht aus
 * `Math.random`. Zwei Aufrufe mit derselben Zahl ergeben dasselbe Bild.
 */
export function baueStroeme(anzahl: number): Strom[] {
  const n = Math.round(klemme(anzahl, MIN_STROEME, MAX_STROEME));
  const stroeme: Strom[] = [];

  for (let i = 0; i < n; i += 1) {
    const r = (i * 0.618033988749895) % 1;

    let kanal: Kanal = "pink";
    let z = 0;
    let breite = 7;
    if (i === n - 1) {
      kanal = "cyan";
      z = 3;
    } else if (i === n - 2) {
      kanal = "orange";
      z = 2;
      breite = 8;
    } else if (i === 2 || i === 6) {
      kanal = "violett";
      z = 1;
    }

    const streuung =
      i === n - 1 ? -0.35 : i === n - 2 ? -0.62 : i === 2 || i === 6 ? 0.7 : (r - 0.5) * 1.9;

    stroeme.push({
      kanal,
      z,
      breite,
      base: streuung * 340,
      amp: 90 + r * 210,
      f1: 0.7 + r * 1.5,
      f2: 1.3 + ((i * 0.3819) % 1) * 2.6,
      p1: i * 1.37,
      p2: i * 2.19 + 0.7,
      s1: 0.2 + r * 0.26,
      s2: 0.13 + ((i * 0.7549) % 1) * 0.3,
      drift: 0.06 + r * 0.1,
      bias: (r - 0.5) * 150,
    });
  }

  // Stabil nach z: cyan und orange liegen zuletzt und damit obenauf.
  return stroeme.sort((a, b) => a.z - b.z);
}

/** Die zehn Schienen, paarweise um die Mittellinie gespiegelt. */
export function baueSchienen(): Schiene[] {
  const schienen: Schiene[] = [];
  SCHIENEN_ABSTAENDE.forEach((abstand, i) => {
    const stufe = SCHIENEN_ABSTAENDE.length - 1 - i;
    for (const vorzeichen of [-1, 1] as const) {
      schienen.push({
        y: SZENE.CY + vorzeichen * abstand,
        split: SZENE.NODE + 110 + stufe * 26,
        run: 150 + stufe * 26,
        ton: i % 2 === 0 ? "a" : "b",
      });
    }
  });
  return schienen;
}

/**
 * Die Huellkurve der Stroeme: links volle Auslenkung, am Knoten null. Das ist die Aussage
 * des Bildes, deshalb steht sie als eigene Funktion da und wird geprueft.
 */
export function huellkurve(t: number): number {
  return Math.pow(1 - klemme(t, 0, 1), 1.25);
}

export function stromY(s: Strom, t: number, zeit: number): number {
  const v =
    Math.sin(t * s.f1 * Math.PI + s.p1 + zeit * s.s1) +
    0.62 * Math.sin(t * s.f2 * Math.PI + s.p2 - zeit * s.s2);
  return (
    SZENE.CY + huellkurve(t) * (s.base + s.amp * v * 0.6 + s.bias * Math.sin(zeit * s.drift + s.p2))
  );
}

/**
 * Punkt auf einem Strom, `u` von 0 (links ausserhalb) bis 1 (am Knoten).
 *
 * Abweichung von der Vorlage, bewusst: sie zeichnet die Linie mit `t = x / NODE`, rechnet
 * die Paketposition aber mit `t = (x + 120) / (NODE + 120)`. Die Pakete liefen dadurch im
 * linken Drittel neben ihrer eigenen Linie. Hier gilt beides Mal die Formel, die man sieht.
 */
export function stromPunkt(s: Strom, u: number, zeit: number): { x: number; y: number } {
  const x = -SZENE.EINLAUF + klemme(u, 0, 1) * (SZENE.NODE + SZENE.EINLAUF);
  return { x, y: stromY(s, klemme(x / SZENE.NODE, 0, 1), zeit) };
}

/** Punkt auf einer Schiene, `u` von 0 (am Knoten) bis 1 (rechts ausserhalb). */
export function schienenPunkt(r: Schiene, u: number): { x: number; y: number } {
  const gerade = r.split - SZENE.NODE;
  const auslauf = SZENE.W + 60 - (r.split + r.run);
  const gesamt = gerade + r.run + auslauf;
  const d = klemme(u, 0, 1) * gesamt;

  if (d <= gerade) return { x: SZENE.NODE + d, y: SZENE.CY };

  if (d <= gerade + r.run) {
    const k = (d - gerade) / r.run;
    // Weiche Ein- und Ausfahrt, damit der Abzweig nicht knickt.
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    return { x: r.split + k * r.run, y: SZENE.CY + (r.y - SZENE.CY) * e };
  }

  return { x: r.split + r.run + (d - gerade - r.run), y: r.y };
}

/**
 * Zufallsauswahl mit uebergebener Zahl. So bleibt der Zufall an der Aufrufstelle und die
 * Auswahl laesst sich pruefen. Gibt `undefined` bei leerer Liste, `noUncheckedIndexedAccess`
 * verlangt die Behandlung ohnehin.
 */
export function waehleZufaellig<T>(werte: readonly T[], r: number): T | undefined {
  if (werte.length === 0) return undefined;
  return werte[Math.min(werte.length - 1, Math.floor(klemme(r, 0, 1) * werte.length))];
}
