import { useEffect, useMemo, useRef } from "react";

import { readCssVars } from "@/lib/readCssVars";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { neuerLauf, PALETTEN_NAMEN, zeichneBild, type Palette } from "./draw";
import { baueSchienen, baueStroeme, STANDBILD_ZEIT } from "./geometry";

/**
 * Das AXON-Keyvisual als Animation.
 *
 * Der Canvas fuellt seinen Umschlag und traegt keine Information: er ist `aria-hidden`.
 * Die Farben kommen aus den Tokens von `.szene-axon`, gelesen am Canvas selbst, damit der
 * Geltungsbereich greift.
 *
 * Bei `prefers-reduced-motion` laeuft **keine** Schleife: es wird genau ein Bild gezeichnet.
 * Der Block in `tokens.css` daempft nur CSS-Dauern, eine Animationsschleife nicht.
 */

interface Props {
  readonly tempo?: number;
  readonly spurenzahl?: number;
}

export function AxonKeyvisual({ tempo = 1, spurenzahl = 15 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stroeme = useMemo(() => baueStroeme(spurenzahl), [spurenzahl]);
  const schienen = useMemo(() => baueSchienen(), []);
  const ruhig = useMediaQuery("(prefers-reduced-motion: reduce)");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    // Ohne 2D-Kontext bleibt die Flaeche einfach flach blau. Kein Fehler auf der
    // Anmeldeseite, die Browserabnahme verbietet jede Konsolenausgabe.
    if (!ctx) return;

    const palette = readCssVars(canvas, PALETTEN_NAMEN) as Palette;

    /*
     * Der gesamte Laufzustand liegt in dieser Closure, nicht in Refs. Refs ueberleben den
     * doppelten Mount von StrictMode und wuerden einen halb gelaufenen Zustand fortsetzen.
     */
    let aktiv = true;
    let bildId = 0;
    let geom = { breite: 0, hoehe: 0, dpr: 1 };
    let zeit = ruhig ? STANDBILD_ZEIT : 0;
    let letzteZeit = 0;
    const lauf = neuerLauf();

    const zeichne = (dt: number) => {
      zeichneBild({
        ctx,
        breite: geom.breite,
        hoehe: geom.hoehe,
        dpr: geom.dpr,
        stroeme,
        schienen,
        palette,
        zeit,
        dt,
        lauf,
        mitPaketen: !ruhig,
      });
    };

    const messen = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const breite = canvas.clientWidth;
      const hoehe = canvas.clientHeight;
      geom = { breite, hoehe, dpr };

      const pufferBreite = Math.round(breite * dpr);
      const pufferHoehe = Math.round(hoehe * dpr);
      if (canvas.width !== pufferBreite) canvas.width = pufferBreite;
      if (canvas.height !== pufferHoehe) canvas.height = pufferHoehe;

      // Im Ruhemodus laeuft keine Schleife, und das Setzen von width leert den Puffer:
      // das Standbild muss hier neu gezeichnet werden.
      if (ruhig) zeichne(0);
    };

    const takt = (jetzt: number) => {
      if (!aktiv) return;
      const dt = Math.min(0.05, (jetzt - (letzteZeit || jetzt)) / 1000) * tempo;
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
  }, [stroeme, schienen, tempo, ruhig]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 block size-full select-none"
    />
  );
}
