import { useEffect, useRef } from "react";

import { readCssVars } from "@/lib/readCssVars";
import { useMediaQuery } from "@/lib/useMediaQuery";

/**
 * Der ruhige Hintergrund des Einstiegs: waagerechte Straenge, auf denen Datenpunkte
 * wandern.
 *
 * Verwandt mit dem Keyvisual der Anmeldung, aber bewusst ein eigener Bauteil. Dort steht
 * das Bild im Mittelpunkt und darf laut sein; hier liegt es unter einer Tabelle und darf
 * beim Lesen nicht stoeren. Deshalb sehr geringe Deckkraft und an beiden Raendern
 * ausgeblendet.
 *
 * Bei `prefers-reduced-motion` laeuft **keine** Schleife, es wird ein Bild gezeichnet. Der
 * Block in `tokens.css` daempft nur CSS-Dauern, eine rAF-Schleife nicht.
 */

const FARBEN = ["--axon-strom-pink", "--axon-knoten"] as const;

/** Zeit des Standbilds. Ein Wert, bei dem die Straenge auseinanderlaufen. */
const STANDBILD_ZEIT = 12;

/** Ganggeschwindigkeit. Wie beim Keyvisual an genau einer Stelle, am `dt`. */
const TEMPO = 0.55;

interface Strang {
  /** Lage in der Hoehe, 0 bis 1 */
  readonly y: number;
  /** Ausschlag in Pixeln */
  readonly a: number;
  /** Ortsfrequenz */
  readonly f: number;
  /** Wandergeschwindigkeit der Welle */
  readonly s: number;
  /** Phase, damit die Straenge nicht im Gleichschritt laufen */
  readonly p: number;
  /** Deckkraft */
  readonly o: number;
}

const STRAENGE: readonly Strang[] = [
  { y: 0.1, a: 22, f: 0.0031, s: 0.09, p: 0.3, o: 0.035 },
  { y: 0.24, a: 28, f: 0.0024, s: 0.07, p: 1.2, o: 0.028 },
  { y: 0.38, a: 25, f: 0.0028, s: 0.08, p: 2.4, o: 0.038 },
  { y: 0.52, a: 30, f: 0.0021, s: 0.06, p: 3.5, o: 0.025 },
  { y: 0.66, a: 24, f: 0.0026, s: 0.075, p: 4.6, o: 0.035 },
  { y: 0.8, a: 27, f: 0.0023, s: 0.055, p: 5.4, o: 0.028 },
  { y: 0.93, a: 20, f: 0.003, s: 0.075, p: 6.1, o: 0.03 },
];

/** Lage eines Punktes auf seinem Strang. Zwei Sinus, damit die Welle nicht regelmaessig wirkt. */
function hoeheAuf(strang: Strang, x: number, h: number, zeit: number): number {
  return (
    h * strang.y +
    strang.a * Math.sin(x * strang.f - zeit * strang.s + strang.p) +
    strang.a * 0.45 * Math.sin(x * strang.f * 2.1 + zeit * strang.s * 0.8 + strang.p)
  );
}

interface Punkt {
  readonly strang: Strang;
  x: number;
  readonly v: number;
}

/** Der Schein um einen Punkt, einmal in einen kleinen Canvas gezeichnet und dann kopiert. */
function baueSchein(farbe: string): HTMLCanvasElement | null {
  const flaeche = document.createElement("canvas");
  flaeche.width = 64;
  flaeche.height = 64;
  const ctx = flaeche.getContext("2d");
  if (!ctx) return null;
  const verlauf = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  verlauf.addColorStop(0, farbe);
  verlauf.addColorStop(0.5, "transparent");
  verlauf.addColorStop(1, "transparent");
  ctx.fillStyle = verlauf;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(0, 0, 64, 64);
  return flaeche;
}

export function Datenband() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ruhig = useMediaQuery("(prefers-reduced-motion: reduce)");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    // Ohne 2D-Kontext bleibt die Flaeche einfach der Verlauf darunter. Kein Fehler.
    if (!ctx) return;

    const palette = readCssVars(canvas, FARBEN);
    const schein = baueSchein(palette["--axon-knoten"]);

    /*
     * Der gesamte Laufzustand liegt in dieser Closure, nicht in Refs. Refs ueberleben den
     * doppelten Mount von StrictMode und wuerden einen halb gelaufenen Zustand fortsetzen.
     */
    let aktiv = true;
    let bildId = 0;
    let breite = 0;
    let hoehe = 0;
    let dpr = 1;
    let zeit = ruhig ? STANDBILD_ZEIT : 0;
    let letzteZeit = 0;
    let bisNaechstem = 0.9;
    let punkte: Punkt[] = [];

    /** Beim ersten Bild sitzen schon Punkte auf den Straengen, es faengt nicht leer an. */
    const saeen = () => {
      punkte = [0.04, 0.14, 0.24, 0.34, 0.44, 0.54, 0.64, 0.74, 0.84, 0.94].map((anteil, i) => ({
        strang: STRAENGE[i % STRAENGE.length]!,
        x: breite * anteil,
        v: 12 + (i % 4) * 5,
      }));
    };

    const zeichnePunkt = (x: number, y: number, deckkraft: number) => {
      if (schein) {
        ctx.globalAlpha = deckkraft * 0.85;
        ctx.drawImage(schein, x - 13, y - 13, 26, 26);
      }
      ctx.globalAlpha = deckkraft;
      ctx.beginPath();
      ctx.arc(x, y, 1.9, 0, Math.PI * 2);
      ctx.fillStyle = palette["--axon-knoten"];
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    const zeichne = (dt: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, breite, hoehe);

      for (const strang of STRAENGE) {
        ctx.beginPath();
        for (let x = 0; x <= breite; x += 10) {
          const y = hoeheAuf(strang, x, hoehe, zeit);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = palette["--axon-strom-pink"];
        ctx.globalAlpha = strang.o;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      bisNaechstem -= dt;
      if (bisNaechstem <= 0) {
        bisNaechstem = 0.9 + Math.random() * 1.2;
        punkte.push({
          strang: STRAENGE[Math.floor(Math.random() * STRAENGE.length)]!,
          x: -14,
          v: 12 + Math.random() * 12,
        });
      }

      punkte = punkte.filter((punkt) => {
        punkt.x += punkt.v * dt;
        if (punkt.x > breite + 14) return false;
        // An beiden Raendern ausblenden, damit nichts hart auftaucht oder abreisst.
        const rand = Math.min(punkt.x, breite - punkt.x) / 110;
        zeichnePunkt(
          punkt.x,
          hoeheAuf(punkt.strang, punkt.x, hoehe, zeit),
          Math.max(0, Math.min(1, rand)) * 0.5,
        );
        return true;
      });
    };

    const messen = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      breite = canvas.clientWidth;
      hoehe = canvas.clientHeight;

      const pufferBreite = Math.round(breite * dpr);
      const pufferHoehe = Math.round(hoehe * dpr);
      if (canvas.width !== pufferBreite) canvas.width = pufferBreite;
      if (canvas.height !== pufferHoehe) canvas.height = pufferHoehe;

      if (punkte.length === 0) saeen();
      // Das Setzen von width leert den Puffer. Im Ruhemodus laeuft keine Schleife, die das
      // nachholen koennte, also hier neu zeichnen.
      if (ruhig) zeichne(0);
    };

    const takt = (jetzt: number) => {
      if (!aktiv) return;
      const dt = Math.min(0.05, (jetzt - (letzteZeit || jetzt)) / 1000) * TEMPO;
      letzteZeit = jetzt;
      // Inkrementell statt jetzt-minus-Start: sonst springen nach einem Hintergrundtab
      // alle Phasen auf einmal weiter.
      zeit += dt;
      zeichne(dt);
      // Nachforderung am Ende, nicht am Anfang: sonst liefe das Aufraeumen ins Leere.
      bildId = requestAnimationFrame(takt);
    };

    const beobachter = new ResizeObserver(messen);
    beobachter.observe(canvas);
    // Ein reiner Wechsel der Geraetepixel (Zoom, anderer Bildschirm) aendert die
    // CSS-Groesse nicht und erreicht den Beobachter deshalb nicht.
    window.addEventListener("resize", messen);
    messen();

    if (!ruhig) bildId = requestAnimationFrame(takt);

    return () => {
      aktiv = false;
      cancelAnimationFrame(bildId);
      beobachter.disconnect();
      window.removeEventListener("resize", messen);
    };
  }, [ruhig]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 block size-full select-none"
    />
  );
}
