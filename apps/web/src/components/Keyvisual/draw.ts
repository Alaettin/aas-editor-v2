import {
  schienenPunkt,
  stromPunkt,
  SZENE,
  waehleZufaellig,
  type Kanal,
  type Schiene,
  type Schienenton,
  type Strom,
} from "./geometry";

/**
 * Der Zeichenteil des Keyvisuals. Kennt React nicht und haelt keinen Zustand: er bekommt
 * ihn herein und gibt ihn fortgeschrieben zurueck.
 *
 * Farben kommen als Palette von aussen, aufgeloest aus den Tokens. Im Code steht kein
 * einziger Farbwert.
 */

export type PalettenName =
  | "--axon-grund"
  | "--axon-strom-pink"
  | "--axon-strom-violett"
  | "--axon-strom-cyan"
  | "--axon-strom-orange"
  | "--axon-schiene-a"
  | "--axon-schiene-b"
  | "--axon-knoten";

export const PALETTEN_NAMEN: readonly PalettenName[] = [
  "--axon-grund",
  "--axon-strom-pink",
  "--axon-strom-violett",
  "--axon-strom-cyan",
  "--axon-strom-orange",
  "--axon-schiene-a",
  "--axon-schiene-b",
  "--axon-knoten",
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

/** Ein Paket auf einem Strom, links vom Knoten. */
interface Paket {
  readonly strom: Strom;
  u: number;
  readonly v: number;
}

/** Ein Paket auf einer Schiene, rechts vom Knoten. */
interface Ausgang {
  readonly schiene: Schiene;
  u: number;
  readonly v: number;
}

export interface Lauf {
  pakete: Paket[];
  ausgaenge: Ausgang[];
  /** Nachleuchten des Knotens, faellt mit der Zeit auf null */
  puls: number;
  naechsterEinwurf: number;
}

export function neuerLauf(): Lauf {
  return { pakete: [], ausgaenge: [], puls: 0, naechsterEinwurf: 0.4 };
}

export interface Bild {
  readonly ctx: CanvasRenderingContext2D;
  readonly breite: number;
  readonly hoehe: number;
  readonly dpr: number;
  readonly stroeme: readonly Strom[];
  readonly schienen: readonly Schiene[];
  readonly palette: Palette;
  readonly zeit: number;
  readonly dt: number;
  readonly lauf: Lauf;
  /** Ob Datenpakete wandern. Im Standbild fuer reduzierte Bewegung: nein. */
  readonly mitPaketen: boolean;
}

/**
 * Zeichnet ein Bild. Tut nichts, wenn die Flaeche entartet ist: ein Farbverlauf mit nicht
 * endlichen Koordinaten wuerde werfen, und ein Fehler auf der Anmeldeseite ist teurer als
 * ein ausgelassenes Bild.
 */
export function zeichneBild(bild: Bild): void {
  const { ctx, breite, hoehe, dpr, palette } = bild;
  if (breite <= 0 || hoehe <= 0) return;

  const skala = (breite / SZENE.W) * dpr;
  if (!Number.isFinite(skala) || skala <= 0) return;

  const pufferBreite = Math.round(breite * dpr);
  const pufferHoehe = Math.round(hoehe * dpr);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, pufferBreite, pufferHoehe);
  ctx.fillStyle = palette["--axon-grund"];
  ctx.fillRect(0, 0, pufferBreite, pufferHoehe);
  ctx.translate(pufferBreite / 2, pufferHoehe / 2);
  ctx.scale(skala, skala);
  ctx.translate(-SZENE.W / 2, -SZENE.H / 2);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  zeichneStroeme(bild);
  zeichneSchienen(bild);
  zeichneBuendel(bild);
  if (bild.mitPaketen) zeichnePakete(bild);
  zeichneKnoten(bild);
}

function zeichneStroeme({ ctx, stroeme, palette, zeit }: Bild): void {
  for (const strom of stroeme) {
    ctx.beginPath();
    for (let i = 0; i <= 140; i += 1) {
      const punkt = stromPunkt(strom, i / 140, zeit);
      if (i === 0) ctx.moveTo(punkt.x, punkt.y);
      else ctx.lineTo(punkt.x, punkt.y);
    }
    ctx.strokeStyle = palette[KANAL_TOKEN[strom.kanal]];
    ctx.lineWidth = strom.breite;
    ctx.stroke();
  }
}

function zeichneSchienen({ ctx, schienen, palette }: Bild): void {
  for (const schiene of schienen) {
    ctx.beginPath();
    for (let i = 0; i <= 90; i += 1) {
      const punkt = schienenPunkt(schiene, i / 90);
      if (i === 0) ctx.moveTo(punkt.x, punkt.y);
      else ctx.lineTo(punkt.x, punkt.y);
    }
    ctx.strokeStyle = palette[SCHIENEN_TOKEN[schiene.ton]];
    ctx.lineWidth = 8;
    ctx.stroke();
  }
}

/** Der Uebergang durch den Knoten: bunt hinein, weiss im Knoten, gruen hinaus. */
function zeichneBuendel({ ctx, palette }: Bild): void {
  const verlauf = ctx.createLinearGradient(SZENE.NODE - 130, 0, SZENE.NODE + 150, 0);
  verlauf.addColorStop(0, palette["--axon-strom-pink"]);
  verlauf.addColorStop(0.42, palette["--axon-knoten"]);
  verlauf.addColorStop(1, palette["--axon-schiene-a"]);

  ctx.beginPath();
  ctx.moveTo(SZENE.NODE - 150, SZENE.CY);
  ctx.lineTo(SZENE.NODE + 160, SZENE.CY);
  ctx.strokeStyle = verlauf;
  ctx.lineWidth = 9;
  ctx.stroke();
}

function zeichneKnoten({ ctx, palette, lauf }: Bild): void {
  const r = 11 + lauf.puls * 5;

  if (lauf.puls > 0) {
    ctx.beginPath();
    ctx.arc(SZENE.NODE, SZENE.CY, r + 14 + (1 - lauf.puls) * 34, 0, Math.PI * 2);
    ctx.globalAlpha = 0.35 * lauf.puls;
    ctx.strokeStyle = palette["--axon-knoten"];
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.beginPath();
  ctx.arc(SZENE.NODE, SZENE.CY, r, 0, Math.PI * 2);
  ctx.fillStyle = palette["--axon-knoten"];
  ctx.fill();
}

/**
 * Datenpakete: sie wandern auf einem Strom zum Knoten, loesen dort den Puls aus und laufen
 * auf einer zufaelligen Schiene weiter. Genau das ist die Aussage des Bildes in Bewegung.
 */
function zeichnePakete(bild: Bild): void {
  const { ctx, palette, zeit, dt, lauf, stroeme, schienen } = bild;

  lauf.puls = Math.max(0, lauf.puls - dt * 1.7);
  lauf.naechsterEinwurf -= dt;

  if (lauf.naechsterEinwurf <= 0) {
    lauf.naechsterEinwurf = 0.22 + Math.random() * 0.34;
    const strom = waehleZufaellig(stroeme, Math.random());
    if (strom) lauf.pakete.push({ strom, u: 0, v: 0.32 + Math.random() * 0.16 });
  }

  ctx.strokeStyle = palette["--axon-knoten"];
  ctx.lineWidth = 6;

  lauf.pakete = lauf.pakete.filter((paket) => {
    paket.u += paket.v * dt;
    if (paket.u >= 1) {
      lauf.puls = 1;
      const schiene = waehleZufaellig(schienen, Math.random());
      if (schiene) lauf.ausgaenge.push({ schiene, u: 0.02, v: 0.42 + Math.random() * 0.12 });
      return false;
    }

    ctx.globalAlpha = 0.5 + 0.5 * paket.u;
    ctx.beginPath();
    for (let i = 0; i <= 14; i += 1) {
      const u = Math.max(0, paket.u - 0.075 + (0.075 * i) / 14);
      const punkt = stromPunkt(paket.strom, u, zeit);
      if (i === 0) ctx.moveTo(punkt.x, punkt.y);
      else ctx.lineTo(punkt.x, punkt.y);
    }
    ctx.stroke();
    return true;
  });

  lauf.ausgaenge = lauf.ausgaenge.filter((ausgang) => {
    ausgang.u += ausgang.v * dt;
    if (ausgang.u >= 1) return false;

    ctx.globalAlpha = 0.75 * (1 - ausgang.u * 0.55);
    ctx.beginPath();
    for (let i = 0; i <= 14; i += 1) {
      const u = Math.max(0, ausgang.u - 0.06 + (0.06 * i) / 14);
      const punkt = schienenPunkt(ausgang.schiene, u);
      if (i === 0) ctx.moveTo(punkt.x, punkt.y);
      else ctx.lineTo(punkt.x, punkt.y);
    }
    ctx.stroke();
    return true;
  });

  ctx.globalAlpha = 1;
}
