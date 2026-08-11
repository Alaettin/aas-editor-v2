import type { FastifyInstance } from "fastify";

/**
 * Sicherheitskopfzeilen auf jeder Antwort.
 *
 * Handgesetzt statt `@fastify/helmet`: es sind ein Dutzend Zeilen, und der Wert je Zeile
 * gehoert an dieser Stelle erklaert, nicht in die Vorgaben einer Bibliothek. Aufgekommen im
 * Sicherheitsaudit vom 11.08.2026 (hoher Befund): der Dienst lieferte keine einzige.
 *
 * Der `onSend`-Haken trifft **alle** Antworten, auch die statischen Dateien und den
 * SPA-Rueckfall; ein preHandler wuerde die statische Auslieferung verpassen.
 */

/**
 * Die Content-Security-Policy, zugeschnitten auf die eigene SPA.
 *
 * `style-src 'unsafe-inline'`: Radix und andere Bauteile setzen Stile direkt am Element,
 * ohne das laedt die Oberflaeche nicht. Skripte dagegen sind allesamt gebuendelt, deshalb
 * dort **kein** `unsafe-inline`. `img-src ... data: blob:` und `frame-src ... blob:` fuer die
 * Vorschau von Anhaengen, die als Blob-URL im Browser entstehen. `connect-src 'self'`, weil
 * der Klient nur die eigene API ruft. `frame-ancestors 'none'` verbietet das Einbetten
 * (Clickjacking), `object-src 'none'` alte Plugins, `base-uri 'self'` ein untergeschobenes
 * `<base>`.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export function installiereSicherheitskopfzeilen(app: FastifyInstance, production: boolean): void {
  app.addHook("onSend", (_req, reply, nutzlast, fertig) => {
    void reply.header("content-security-policy", CSP);
    void reply.header("x-frame-options", "DENY");
    void reply.header("x-content-type-options", "nosniff");
    void reply.header("referrer-policy", "no-referrer");
    // Keine der starken Browser-Funktionen wird gebraucht; alles abschalten.
    void reply.header("permissions-policy", "camera=(), microphone=(), geolocation=()");
    /*
     * HSTS nur in Produktion: im Entwicklungsbetrieb laeuft der Server ueber http, und ein
     * ausgesandtes HSTS wuerde den Browser fuer localhost auf https festnageln. Auf Sliplane
     * und hinter Caddy endet TLS ohnehin vor dem Container, `production` trifft also den
     * richtigen Fall.
     */
    if (production) {
      void reply.header("strict-transport-security", "max-age=31536000; includeSubDomains");
    }
    fertig(null, nutzlast);
  });
}
