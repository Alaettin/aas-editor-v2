import { lookup } from "node:dns/promises";
import { BlockList, isIPv4, isIPv6 } from "node:net";

/**
 * Holt eine Datei von einer fremden Adresse, ohne dass daraus ein Fernrohr in das eigene
 * Netz wird.
 *
 * Der MCP-Zugang steht ohne Anmeldung im Netz. Ein Werkzeug, das eine beliebige URL
 * abruft und das Ergebnis zurueckgibt, ist damit ein SSRF-Werkzeug fuer jeden, der die
 * Adresse kennt: `http://169.254.169.254/latest/meta-data/` liegt in vielen Rechenzentren
 * einen Aufruf entfernt, und ein Dienst im selben Netz antwortet gern.
 *
 * Deshalb drei Zaeune, und zwar **vor** jedem einzelnen Verbindungsaufbau:
 * nur https, der aufgeloeste Zielrechner darf nicht in einem internen Bereich liegen, und
 * Weiterleitungen werden von Hand verfolgt. Der letzte Punkt ist der, den man vergisst:
 * eine oeffentliche Adresse, die auf `127.0.0.1` weiterleitet, kaeme sonst durch.
 */

/** Bereiche, in denen nichts liegt, was ein fremder Aufrufer sehen darf. */
const GESPERRT = new BlockList();
// IPv4
GESPERRT.addSubnet("0.0.0.0", 8); // dieses Netz
GESPERRT.addSubnet("10.0.0.0", 8); // privat
GESPERRT.addSubnet("100.64.0.0", 10); // Carrier-Grade NAT
GESPERRT.addSubnet("127.0.0.0", 8); // Loopback
GESPERRT.addSubnet("169.254.0.0", 16); // link-local, hier wohnt der Metadatendienst
GESPERRT.addSubnet("172.16.0.0", 12); // privat, und das Docker-Netz
GESPERRT.addSubnet("192.0.0.0", 24); // IETF-Protokollzuweisungen
GESPERRT.addSubnet("192.168.0.0", 16); // privat
GESPERRT.addSubnet("198.18.0.0", 15); // Messzwecke
GESPERRT.addSubnet("224.0.0.0", 4); // Multicast
GESPERRT.addSubnet("240.0.0.0", 4); // reserviert
// IPv6
GESPERRT.addAddress("::", "ipv6");
GESPERRT.addAddress("::1", "ipv6"); // Loopback
GESPERRT.addSubnet("fc00::", 7, "ipv6"); // unique local
GESPERRT.addSubnet("fe80::", 10, "ipv6"); // link-local
GESPERRT.addSubnet("ff00::", 8, "ipv6"); // Multicast
// IPv4-Adressen im IPv6-Kleid. `::ffff:169.254.169.254` ist derselbe Metadatendienst.
GESPERRT.addSubnet("::ffff:0:0", 96, "ipv6");

const MAX_WEITERLEITUNGEN = 3;
const ZEITGRENZE_MS = 20_000;

export class NetzFehler extends Error {}

/**
 * Loest den Namen auf und laesst nur oeffentliche Adressen durch.
 *
 * Aufgeloest wird **mit `all: true`**: ein Name kann auf mehrere Adressen zeigen, und es
 * genuegt nicht, die erste zu pruefen. Zwischen dieser Pruefung und dem Verbindungsaufbau
 * bleibt ein Zeitfenster (DNS rebinding); es zu schliessen hiesse, die Verbindung selbst
 * an eine geprueft IP zu binden, und das kostet einen eigenen Agenten. Fuer einen
 * Zugang, der Herstellerdokumente holt, ist der Zaun hier die richtige Groesse.
 */
async function pruefeZiel(url: URL): Promise<void> {
  if (url.protocol !== "https:") {
    throw new NetzFehler(`Nur https wird abgerufen, gelesen wurde "${url.protocol}".`);
  }

  const name = url.hostname.replace(/^\[|\]$/g, "");

  // Steht dort schon eine IP, gibt es nichts aufzuloesen, aber sehr wohl zu pruefen.
  const adressen =
    isIPv4(name) || isIPv6(name)
      ? [name]
      : await lookup(name, { all: true })
          .then((treffer) => treffer.map((t) => t.address))
          .catch(() => {
            throw new NetzFehler(`Der Name "${name}" liess sich nicht aufloesen.`);
          });

  for (const adresse of adressen) {
    const art = isIPv6(adresse) ? "ipv6" : "ipv4";
    if (GESPERRT.check(adresse, art)) {
      throw new NetzFehler(
        `"${name}" zeigt auf ${adresse}, und diese Adresse liegt in einem internen Bereich.`,
      );
    }
  }
}

export interface Geholt {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  /** Die zuletzt angefragte Adresse, nach allen Weiterleitungen. */
  readonly url: URL;
}

/**
 * @param maxBytes harte Obergrenze. Geprueft wird zweimal: am `content-length`, falls es
 * eines gibt, und danach an den tatsaechlich gelesenen Bytes. Ein Server, der eine falsche
 * Laenge meldet, kommt sonst durch den ersten Zaun.
 */
export async function holeSicher(roh: string, maxBytes: number): Promise<Geholt> {
  let ziel: URL;
  try {
    ziel = new URL(roh);
  } catch {
    throw new NetzFehler(`"${roh}" ist keine gueltige Adresse.`);
  }

  for (let sprung = 0; sprung <= MAX_WEITERLEITUNGEN; sprung += 1) {
    await pruefeZiel(ziel);

    const abbruch = AbortSignal.timeout(ZEITGRENZE_MS);
    // `manual` statt `follow`: sonst folgt fetch selbst, und die Pruefung oben haette nur
    // den ersten Sprung gesehen.
    const antwort = await fetch(ziel, { redirect: "manual", signal: abbruch }).catch(
      (ursache: unknown) => {
        throw new NetzFehler(`Der Abruf scheiterte: ${(ursache as Error).message}`);
      },
    );

    if (antwort.status >= 300 && antwort.status < 400) {
      const weiter = antwort.headers.get("location");
      if (weiter === null) {
        throw new NetzFehler(`Weiterleitung ${antwort.status} ohne Ziel.`);
      }
      ziel = new URL(weiter, ziel);
      continue;
    }

    if (!antwort.ok) {
      throw new NetzFehler(`Die Adresse antwortete mit ${antwort.status}.`);
    }

    const gemeldet = Number(antwort.headers.get("content-length") ?? "0");
    if (Number.isFinite(gemeldet) && gemeldet > maxBytes) {
      throw new NetzFehler(
        `Die Datei ist ${Math.round(gemeldet / 1024 / 1024)} MB gross, erlaubt sind ${Math.round(maxBytes / 1024 / 1024)} MB.`,
      );
    }

    const puffer = await antwort.arrayBuffer();
    if (puffer.byteLength > maxBytes) {
      throw new NetzFehler(
        `Die Datei ist groesser als ${Math.round(maxBytes / 1024 / 1024)} MB.`,
      );
    }

    return {
      bytes: new Uint8Array(puffer),
      contentType: (antwort.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "",
      url: ziel,
    };
  }

  throw new NetzFehler(`Mehr als ${MAX_WEITERLEITUNGEN} Weiterleitungen.`);
}
