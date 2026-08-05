/**
 * Die Geometrie des AXON-Keyvisuals: chaotische Stroeme laufen von links in einen Knoten
 * und verlassen ihn als geordnete Schienen nach rechts.
 *
 * Bewusst rein rechnend, ohne DOM und **ohne jede Farbe**. Stroeme und Schienen tragen
 * Rollennamen, die Farbe kommt erst beim Zeichnen aus den Tokens. Damit laesst sich die
 * Aussage des Bildes unter Node testen, und im Komponentencode steht kein Einzelwert.
 *
 * Die Szene waechst mit dem Fenster: sie fuellt die Hoehe, und der Knoten sitzt immer bei
 * 37,5 Prozent der virtuellen Breite. Deshalb gibt es keine feste Breite mehr, sondern eine
 * `Buehne`, die jede Funktion mitbekommt.
 */

/** Entwurfshoehe. Alle y-Werte beziehen sich darauf. */
export const HOEHE = 900;
/** Mittellinie: hier laufen alle Stroeme zusammen. */
export const CY = 450;
/** Schmaler als das wird die Szene nicht, sonst zerfaellt die Komposition. */
export const MIN_BREITE = 1250;

/**
 * Zeitpunkt des Standbildes fuer reduzierte Bewegung. Fest gewaehlt, nicht null: bei
 * `zeit = 0` liegen alle Phasen nackt beieinander und das Bild wirkt gerechnet.
 */
export const STANDBILD_ZEIT = 7.5;

export interface Buehne {
  /** Virtuelle Breite der Szene, aus Fenstergroesse und Skalierung */
  readonly breite: number;
  /** x des Knotens, 37,5 Prozent der virtuellen Breite */
  readonly knotenX: number;
  /** x, an dem die Stroeme ins Bild laufen, knapp links ausserhalb */
  readonly startX: number;
}

export interface Ansicht {
  readonly buehne: Buehne;
  /** Faktor von Entwurfseinheiten auf CSS-Pixel */
  readonly skala: number;
  /** Vertikale Verschiebung, damit die Szene mittig sitzt */
  readonly versatzY: number;
}

/**
 * Wie die Szene ins Fenster gelegt wird: sie fuellt die Hoehe, und erst wenn sie dadurch
 * schmaler als `MIN_BREITE` waere, entscheidet die Breite. So wird oben und unten nichts
 * abgeschnitten, und auf breiten Bildschirmen waechst die Komposition mit.
 */
export function ansichtFuer(breiteCss: number, hoeheCss: number): Ansicht {
  let skala = hoeheCss / HOEHE;
  if (skala > 0 && breiteCss / skala < MIN_BREITE) skala = breiteCss / MIN_BREITE;
  if (!Number.isFinite(skala) || skala <= 0) skala = 1;

  const breite = breiteCss / skala;
  return {
    buehne: { breite, knotenX: breite * 0.375, startX: -breite * 0.05 },
    skala,
    versatzY: (hoeheCss / skala - HOEHE) / 2,
  };
}

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
  /** Je weiter aussen, desto frueher zweigt die Schiene ab */
  readonly rang: number;
  readonly ton: Schienenton;
  /** Phase der Welle, damit die Schienen nicht im Gleichschritt schwingen */
  readonly phase: number;
}

export const MIN_STROEME = 6;
export const MAX_STROEME = 28;

/** Abstaende der Schienen von der Mittellinie, nach oben und unten gespiegelt. */
const SCHIENEN_ABSTAENDE = [63, 171, 287, 405] as const;

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
      i === n - 1 ? -0.35 : i === n - 2 ? -0.68 : i === 2 || i === 6 ? 0.72 : (r - 0.5) * 1.95;

    stroeme.push({
      kanal,
      z,
      breite,
      base: streuung * 350,
      amp: 90 + r * 200,
      f1: 0.7 + r * 1.5,
      f2: 1.3 + ((i * 0.3819) % 1) * 2.5,
      p1: i * 1.37,
      p2: i * 2.19 + 0.7,
      s1: 0.2 + r * 0.24,
      s2: 0.13 + ((i * 0.7549) % 1) * 0.28,
      drift: 0.06 + r * 0.1,
      bias: (r - 0.5) * 150,
    });
  }

  // Stabil nach z: cyan und orange liegen zuletzt und damit obenauf.
  return stroeme.sort((a, b) => a.z - b.z);
}

/** Die acht Schienen, paarweise um die Mittellinie gespiegelt, von oben nach unten. */
export function baueSchienen(): Schiene[] {
  const schienen: Schiene[] = [];
  SCHIENEN_ABSTAENDE.forEach((abstand, i) => {
    for (const vorzeichen of [-1, 1] as const) {
      schienen.push({
        y: CY + vorzeichen * abstand,
        rang: SCHIENEN_ABSTAENDE.length - 1 - i,
        ton: i % 2 === 0 ? "a" : "b",
        phase: (i * 0.37 + (vorzeichen > 0 ? 0.5 : 0)) % 1,
      });
    }
  });
  return schienen.sort((a, b) => a.y - b.y);
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
  return CY + huellkurve(t) * (s.base + s.amp * v * 0.6 + s.bias * Math.sin(zeit * s.drift + s.p2));
}

/** Punkt auf einem Strom, `u` von 0 (links ausserhalb) bis 1 (am Knoten). */
export function stromPunkt(
  s: Strom,
  u: number,
  zeit: number,
  buehne: Buehne,
): { x: number; y: number } {
  const x = buehne.startX + klemme(u, 0, 1) * (buehne.knotenX - buehne.startX);
  return { x, y: stromY(s, klemme(x / buehne.knotenX, 0, 1), zeit) };
}

/** Abzweig und Bogenlaenge einer Schiene, beides aus ihrem Rang und ihrer Hoehe. */
function bahn(r: Schiene, buehne: Buehne) {
  const abstand = Math.abs(r.y - CY);
  const abzweig = buehne.knotenX + 60 + r.rang * 34;
  const bogen = 210 + abstand * 1.05;
  const auslauf = Math.max(60, buehne.breite + 90 - (abzweig + bogen));
  return { abzweig, bogen, gesamt: abzweig - buehne.knotenX + bogen + auslauf };
}

/**
 * Punkt auf einer Schiene, `u` von 0 (am Knoten) bis 1 (rechts ausserhalb).
 *
 * Drei Abschnitte: gerade auf der Mittellinie bis zum Abzweig, dann der Bogen auf die
 * eigene Hoehe (Smootherstep, damit nichts knickt), dann gerade hinaus. Auf dem geordneten
 * Teil liegt eine flache Welle, die hinter dem Abzweig anschwillt: die Schienen sind
 * geordnet, aber nicht tot.
 */
export function schienenPunkt(
  r: Schiene,
  u: number,
  zeit: number,
  buehne: Buehne,
): { x: number; y: number } {
  const { abzweig, bogen, gesamt } = bahn(r, buehne);
  const gerade = abzweig - buehne.knotenX;
  const d = klemme(u, 0, 1) * gesamt;
  const dy = r.y - CY;

  let x: number;
  let y: number;
  if (d <= gerade) {
    x = buehne.knotenX + d;
    y = CY;
  } else if (d <= gerade + bogen) {
    const k = (d - gerade) / bogen;
    const e = k * k * k * (k * (6 * k - 15) + 10);
    x = abzweig + k * bogen;
    y = CY + dy * e;
  } else {
    x = abzweig + bogen + (d - gerade - bogen);
    y = CY + dy;
  }

  const rampe = klemme((x - abzweig) / 320, 0, 1);
  y +=
    rampe *
    (11 * Math.sin(x * 0.0055 - zeit * 1.05 + r.phase * 6.283) +
      4.5 * Math.sin(x * 0.0121 - zeit * 1.5 + r.phase * 3.1));

  return { x, y };
}

/** Groesste Auslenkung, die die Welle einer Schiene erreichen kann. */
export const WELLE_MAX = 15.5;

/**
 * Zufallsauswahl mit uebergebener Zahl. So bleibt der Zufall an der Aufrufstelle und die
 * Auswahl laesst sich pruefen. Gibt `undefined` bei leerer Liste, `noUncheckedIndexedAccess`
 * verlangt die Behandlung ohnehin.
 */
export function waehleZufaellig<T>(werte: readonly T[], r: number): T | undefined {
  if (werte.length === 0) return undefined;
  return werte[Math.min(werte.length - 1, Math.floor(klemme(r, 0, 1) * werte.length))];
}
