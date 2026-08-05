import {
  CY,
  HOEHE,
  klemme,
  schienenPunkt,
  stromPunkt,
  waehleZufaellig,
  type Ansicht,
  type Kanal,
  type Schiene,
  type Schienenton,
  type Strom,
} from "./geometry";

/**
 * Der Zeichenteil des Keyvisuals. Kennt React nicht und haelt keinen Zustand: er bekommt
 * ihn herein und schreibt ihn fort.
 *
 * Farben kommen als Palette von aussen, aufgeloest aus den Tokens. Werte, die eine eigene
 * Deckkraft brauchen, liegen als Kanaltripel vor und werden hier zusammengesetzt. Im Code
 * steht kein einziger Farbwert.
 */

export type PalettenName =
  | "--axon-grund"
  | "--axon-strom-pink"
  | "--axon-strom-violett"
  | "--axon-strom-cyan"
  | "--axon-strom-orange"
  | "--axon-schiene-a"
  | "--axon-schiene-b"
  | "--axon-knoten"
  | "--axon-wolke-1"
  | "--axon-wolke-2"
  | "--axon-wolke-3"
  | "--axon-ring"
  | "--axon-halo"
  | "--axon-vignette";

export const PALETTEN_NAMEN: readonly PalettenName[] = [
  "--axon-grund",
  "--axon-strom-pink",
  "--axon-strom-violett",
  "--axon-strom-cyan",
  "--axon-strom-orange",
  "--axon-schiene-a",
  "--axon-schiene-b",
  "--axon-knoten",
  "--axon-wolke-1",
  "--axon-wolke-2",
  "--axon-wolke-3",
  "--axon-ring",
  "--axon-halo",
  "--axon-vignette",
];

export type Palette = Record<PalettenName, string>;

const KANAL_TOKEN: Record<Kanal, PalettenName> = {
  pink: "--axon-strom-pink",
  violett: "--axon-strom-violett",
  cyan: "--axon-strom-cyan",
  orange: "--axon-strom-orange",
};

const SCHIENEN_TOKEN: Record<Schienenton, PalettenName> = {
  a: "--axon-schiene-a",
  b: "--axon-schiene-b",
};

/** Setzt ein Kanaltripel aus den Tokens mit einer Deckkraft zusammen. */
function mitDeckkraft(tripel: string, deckkraft: number): string {
  return `rgb(${tripel} / ${String(klemme(deckkraft, 0, 1))})`;
}

/** Ein Lichtpunkt auf einem Strom, links vom Knoten. */
interface Punkt {
  readonly strom: Strom;
  u: number;
  readonly v: number;
  readonly r: number;
  /** Unruhe: Frequenz und Phase der Geschwindigkeitsschwankung */
  readonly j: number;
  readonly jp: number;
}

/** Ein Lichtpunkt auf einer Schiene, rechts vom Knoten. */
interface Ausgang {
  readonly schiene: Schiene;
  u: number;
  readonly r: number;
}

/** Ein Ring, der vom Knoten nach aussen laeuft. */
interface Ring {
  r: number;
}

export interface Lauf {
  punkte: Punkt[];
  ausgaenge: Ausgang[];
  ringe: Ring[];
  /** Nachleuchten des Knotens, faellt mit der Zeit auf null */
  puls: number;
  /** Meldung an die Karte: ein Paket ist angekommen. Faellt ebenfalls auf null. */
  blitz: number;
  naechsterEinwurf: number;
  naechsterRing: number;
  /** Reihum, damit die geordnete Seite gleichmaessig belegt wird */
  schienenZeiger: number;
}

export function neuerLauf(): Lauf {
  return {
    punkte: [],
    ausgaenge: [],
    ringe: [],
    puls: 0,
    blitz: 0,
    naechsterEinwurf: 0.2,
    naechsterRing: 0,
    schienenZeiger: 0,
  };
}

export interface Bild {
  readonly ctx: CanvasRenderingContext2D;
  readonly breite: number;
  readonly hoehe: number;
  readonly dpr: number;
  readonly ansicht: Ansicht;
  readonly stroeme: readonly Strom[];
  readonly schienen: readonly Schiene[];
  readonly palette: Palette;
  /** Weiches Halo, einmal vorgezeichnet. Ohne das leuchten die Punkte nicht. */
  readonly halo: CanvasImageSource | null;
  readonly zeit: number;
  readonly dt: number;
  readonly lauf: Lauf;
  /** Im Standbild fuer reduzierte Bewegung: keine Punkte, keine Ringe, kein Blitz. */
  readonly bewegt: boolean;
}

/**
 * Zeichnet das weiche Halo einmal in ein eigenes Canvas.
 *
 * Ein Verlauf je Punkt und Bild waere der teuerste Posten der ganzen Szene. So wird ein
 * fertiges Bild nur noch skaliert kopiert.
 */
export function baueHalo(palette: Palette): HTMLCanvasElement | null {
  const groesse = 64;
  const canvas = document.createElement("canvas");
  canvas.width = groesse;
  canvas.height = groesse;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const mitte = groesse / 2;
  const verlauf = ctx.createRadialGradient(mitte, mitte, 0, mitte, mitte, mitte);
  verlauf.addColorStop(0, mitDeckkraft(palette["--axon-halo"], 0.9));
  verlauf.addColorStop(0.18, mitDeckkraft(palette["--axon-halo"], 0.5));
  verlauf.addColorStop(0.5, mitDeckkraft(palette["--axon-halo"], 0.14));
  verlauf.addColorStop(1, mitDeckkraft(palette["--axon-halo"], 0));
  ctx.fillStyle = verlauf;
  ctx.fillRect(0, 0, groesse, groesse);
  return canvas;
}

/**
 * Zeichnet ein Bild. Tut nichts, wenn die Flaeche entartet ist: ein Farbverlauf mit nicht
 * endlichen Koordinaten wuerde werfen, und ein Fehler auf der Anmeldeseite ist teurer als
 * ein ausgelassenes Bild.
 */
export function zeichneBild(bild: Bild): void {
  const { ctx, breite, hoehe, dpr, palette, ansicht } = bild;
  if (breite <= 0 || hoehe <= 0) return;

  const skala = ansicht.skala * dpr;
  if (!Number.isFinite(skala) || skala <= 0) return;

  const pufferBreite = Math.round(breite * dpr);
  const pufferHoehe = Math.round(hoehe * dpr);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = palette["--axon-grund"];
  ctx.fillRect(0, 0, pufferBreite, pufferHoehe);
  ctx.scale(skala, skala);
  ctx.translate(0, ansicht.versatzY);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (bild.bewegt) zeichneLicht(bild);
  zeichneStroeme(bild);
  zeichneSchienen(bild);
  zeichneBuendel(bild);
  if (bild.bewegt) bewegePunkte(bild);
  zeichneKnoten(bild);
  zeichneVignette(bild, pufferBreite, pufferHoehe);
}

/**
 * Langsam wanderndes Licht im blauen Feld, dazu Ringe, die vom Knoten auslaufen. Beides
 * nimmt dem Grund die Flaechigkeit, ohne vom Bild abzulenken.
 */
function zeichneLicht({ ctx, palette, ansicht, zeit, dt, lauf }: Bild): void {
  const breite = ansicht.buehne.breite;
  const wolken = [
    {
      token: "--axon-wolke-1" as const,
      x: 0.22,
      y: 0.34,
      r: 0.62,
      a: 0.5,
      sx: 0.09,
      sy: 0.13,
      p: 0,
    },
    {
      token: "--axon-wolke-2" as const,
      x: 0.62,
      y: 0.72,
      r: 0.7,
      a: 0.55,
      sx: 0.07,
      sy: 0.1,
      p: 2.1,
    },
    {
      token: "--axon-wolke-3" as const,
      x: 0.85,
      y: 0.24,
      r: 0.55,
      a: 0.38,
      sx: 0.11,
      sy: 0.08,
      p: 4.2,
    },
  ];

  for (const wolke of wolken) {
    const cx = breite * (wolke.x + 0.06 * Math.sin(zeit * wolke.sx + wolke.p));
    const cy = HOEHE * (wolke.y + 0.08 * Math.sin(zeit * wolke.sy * 1.3 + wolke.p * 1.7));
    const radius = HOEHE * wolke.r * (1 + 0.08 * Math.sin(zeit * 0.12 + wolke.p));

    const verlauf = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    verlauf.addColorStop(0, mitDeckkraft(palette[wolke.token], wolke.a));
    verlauf.addColorStop(1, mitDeckkraft(palette[wolke.token], 0));
    ctx.fillStyle = verlauf;
    ctx.fillRect(-breite, -HOEHE, breite * 3, HOEHE * 3);
  }

  lauf.naechsterRing -= dt;
  if (lauf.naechsterRing <= 0) {
    lauf.naechsterRing = 2.6;
    lauf.ringe.push({ r: 30 });
  }

  ctx.lineWidth = 2;
  lauf.ringe = lauf.ringe.filter((ring) => {
    ring.r += dt * 190;
    const rest = 1 - Math.min(1, ring.r / (HOEHE * 1.15));
    if (rest <= 0) return false;
    ctx.beginPath();
    ctx.arc(ansicht.buehne.knotenX, CY, ring.r, 0, Math.PI * 2);
    ctx.strokeStyle = mitDeckkraft(palette["--axon-ring"], 0.09 * rest);
    ctx.stroke();
    return true;
  });
}

function zeichneStroeme({ ctx, stroeme, palette, zeit, ansicht }: Bild): void {
  for (const strom of stroeme) {
    ctx.beginPath();
    for (let i = 0; i <= 150; i += 1) {
      const punkt = stromPunkt(strom, i / 150, zeit, ansicht.buehne);
      if (i === 0) ctx.moveTo(punkt.x, punkt.y);
      else ctx.lineTo(punkt.x, punkt.y);
    }
    ctx.strokeStyle = palette[KANAL_TOKEN[strom.kanal]];
    ctx.lineWidth = strom.breite;
    ctx.stroke();
  }
}

function zeichneSchienen({ ctx, schienen, palette, zeit, ansicht }: Bild): void {
  for (const schiene of schienen) {
    ctx.beginPath();
    for (let i = 0; i <= 120; i += 1) {
      const punkt = schienenPunkt(schiene, i / 120, zeit, ansicht.buehne);
      if (i === 0) ctx.moveTo(punkt.x, punkt.y);
      else ctx.lineTo(punkt.x, punkt.y);
    }
    ctx.strokeStyle = palette[SCHIENEN_TOKEN[schiene.ton]];
    ctx.lineWidth = 8;
    ctx.stroke();
  }
}

/** Das kurze Stueck hinter dem Knoten: weiss geht in Gruen ueber. */
function zeichneBuendel({ ctx, palette, ansicht }: Bild): void {
  const knotenX = ansicht.buehne.knotenX;
  const verlauf = ctx.createLinearGradient(knotenX, 0, knotenX + 140, 0);
  verlauf.addColorStop(0, palette["--axon-knoten"]);
  verlauf.addColorStop(1, palette["--axon-schiene-a"]);

  ctx.beginPath();
  ctx.moveTo(knotenX, CY);
  ctx.lineTo(knotenX + 140, CY);
  ctx.strokeStyle = verlauf;
  ctx.lineWidth = 9;
  ctx.stroke();
}

function zeichneKnoten(bild: Bild): void {
  const { ctx, palette, ansicht, lauf, dt, bewegt } = bild;
  const knotenX = ansicht.buehne.knotenX;

  if (bewegt) lauf.puls = Math.max(0, lauf.puls - dt * 2.2);

  if (lauf.puls > 0) {
    ctx.beginPath();
    ctx.arc(knotenX, CY, 16 + (1 - lauf.puls) * 54, 0, Math.PI * 2);
    ctx.strokeStyle = mitDeckkraft(palette["--axon-halo"], 0.4 * lauf.puls);
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  zeichneLichtpunkt(bild, knotenX, CY, 12 + lauf.puls * 3, 1);
}

/** Ein Lichtpunkt: weiches Halo plus harter Kern. */
function zeichneLichtpunkt(
  { ctx, palette, halo }: Bild,
  x: number,
  y: number,
  r: number,
  deckkraft: number,
): void {
  if (halo) {
    const g = r * 7;
    ctx.globalAlpha = deckkraft * 0.85;
    ctx.drawImage(halo, x - g, y - g, g * 2, g * 2);
  }

  ctx.globalAlpha = deckkraft;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = palette["--axon-knoten"];
  ctx.fill();
  ctx.globalAlpha = 1;
}

/**
 * Die Datenpakete. Links wandern sie ungleichmaessig schnell und in wechselnder Groesse,
 * rechts alle gleich schnell, gleich gross und der Reihe nach auf die Schienen verteilt.
 * Dieser Unterschied ist die Aussage, nicht Zierrat.
 */
function bewegePunkte(bild: Bild): void {
  const { zeit, dt, lauf, stroeme, schienen, ansicht } = bild;

  lauf.naechsterEinwurf -= dt;
  if (lauf.naechsterEinwurf <= 0) {
    lauf.naechsterEinwurf = 0.42 + Math.random() * 0.4;
    const strom = waehleZufaellig(stroeme, Math.random());
    if (strom) {
      lauf.punkte.push({
        strom,
        u: 0,
        v: 0.15 + Math.random() * 0.12,
        r: 3.4 + Math.random() * 2.2,
        j: 0.5 + Math.random() * 1.6,
        jp: Math.random() * 6.283,
      });
    }
  }

  lauf.punkte = lauf.punkte.filter((punkt) => {
    punkt.u += punkt.v * dt * (1 + 0.55 * Math.sin(zeit * punkt.j + punkt.jp));
    if (punkt.u >= 1) {
      lauf.puls = 1;
      const schiene = schienen[lauf.schienenZeiger % schienen.length];
      lauf.schienenZeiger += 1;
      if (schiene) lauf.ausgaenge.push({ schiene, u: 0.015, r: 4.4 });
      return false;
    }

    const stelle = stromPunkt(punkt.strom, punkt.u, zeit, ansicht.buehne);
    zeichneLichtpunkt(bild, stelle.x, stelle.y, punkt.r, Math.min(1, punkt.u * 6));
    return true;
  });

  lauf.ausgaenge = lauf.ausgaenge.filter((ausgang) => {
    ausgang.u += 0.28 * dt;
    if (ausgang.u >= 1) {
      // Angekommen: die Karte darf das zeigen.
      lauf.blitz = 1;
      return false;
    }

    const stelle = schienenPunkt(ausgang.schiene, ausgang.u, zeit, ansicht.buehne);
    zeichneLichtpunkt(bild, stelle.x, stelle.y, ausgang.r, 1);
    return true;
  });
}

/** Abdunkeln zu den Raendern hin, ohne Szenentransformation. */
function zeichneVignette({ ctx, palette }: Bild, breite: number, hoehe: number): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const verlauf = ctx.createRadialGradient(
    breite * 0.45,
    hoehe / 2,
    Math.min(breite, hoehe) * 0.28,
    breite * 0.45,
    hoehe / 2,
    breite * 0.78,
  );
  verlauf.addColorStop(0, mitDeckkraft(palette["--axon-vignette"], 0));
  verlauf.addColorStop(1, mitDeckkraft(palette["--axon-vignette"], 0.5));
  ctx.fillStyle = verlauf;
  ctx.fillRect(0, 0, breite, hoehe);
}
