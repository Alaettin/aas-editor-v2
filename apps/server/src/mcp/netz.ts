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

/**
 * Ein gesperrter Bereich, mit seinem Namen.
 *
 * Frueher war das eine einzige `BlockList`, und die Meldung konnte deshalb nur sagen "liegt
 * in einem internen Bereich". Genau daran ist am 10.08.2026 eine Klaerung haengengeblieben:
 * eine oeffentliche Akamai-Adresse wurde abgewiesen, und aus der Meldung ging nicht hervor,
 * welche Regel gegriffen hatte. Eine Liste einzelner Bereiche kostet nichts und beantwortet
 * die Frage im Text der Abweisung.
 */
interface Bereich {
  readonly cidr: string;
  readonly name: string;
  readonly netz: BlockList;
}

function bereich(adresse: string, praefix: number, art: "ipv4" | "ipv6", name: string): Bereich {
  const netz = new BlockList();
  netz.addSubnet(adresse, praefix, art);
  return { cidr: `${adresse}/${praefix}`, name, netz };
}

const GESPERRT: readonly Bereich[] = [
  // IPv4
  bereich("0.0.0.0", 8, "ipv4", "dieses Netz"),
  bereich("10.0.0.0", 8, "ipv4", "privat"),
  bereich("100.64.0.0", 10, "ipv4", "Carrier-Grade NAT"),
  bereich("127.0.0.0", 8, "ipv4", "Loopback"),
  bereich("169.254.0.0", 16, "ipv4", "link-local, hier wohnt der Metadatendienst"),
  bereich("172.16.0.0", 12, "ipv4", "privat, und das Docker-Netz"),
  bereich("192.0.0.0", 24, "ipv4", "IETF-Protokollzuweisungen"),
  bereich("192.168.0.0", 16, "ipv4", "privat"),
  bereich("198.18.0.0", 15, "ipv4", "Messzwecke"),
  bereich("224.0.0.0", 4, "ipv4", "Multicast"),
  bereich("240.0.0.0", 4, "ipv4", "reserviert"),
  // IPv6
  bereich("::", 128, "ipv6", "unspezifiziert"),
  bereich("::1", 128, "ipv6", "Loopback"),
  bereich("fc00::", 7, "ipv6", "unique local"),
  bereich("fe80::", 10, "ipv6", "link-local"),
  bereich("ff00::", 8, "ipv6", "Multicast"),
];

/** Der getroffene Bereich, oder `null` fuer eine oeffentliche Adresse. */
function bereichVon(adresse: string): Bereich | null {
  const art = isIPv6(adresse) ? "ipv6" : "ipv4";
  return GESPERRT.find((b) => b.netz.check(adresse, art)) ?? null;
}

/**
 * `::ffff:a.b.c.d` auf `a.b.c.d` zurueckfuehren.
 *
 * Hier lag der Fehlalarm vom 10.08.2026. Die Liste sperrte `::ffff:0:0/96` als Ganzes, also
 * **jede** IPv4-Adresse im IPv6-Kleid, mit der Begruendung, `::ffff:169.254.169.254` sei
 * derselbe Metadatendienst. Das stimmt, nur ist `::ffff:23.201.254.186` eben auch dieselbe
 * oeffentliche Akamai-Adresse. Welche Schreibweise ein Resolver liefert, haengt am
 * Container und nicht am Ziel.
 *
 * Also nicht die Schreibweise beurteilen, sondern die Adresse: ausgepackt und gegen die
 * IPv4-Bereiche gehalten. Der Metadatendienst bleibt gesperrt, jetzt aber wegen
 * 169.254.0.0/16 und mit dieser Begruendung.
 */
function entpacke(adresse: string): string {
  const treffer = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(adresse);
  if (treffer !== null && isIPv4(treffer[1]!)) return treffer[1]!;
  return adresse;
}

const MAX_WEITERLEITUNGEN = 3;
const ZEITGRENZE_MS = 20_000;

export class NetzFehler extends Error {}

/**
 * Ob ein Name auf der Positivliste steht.
 *
 * Genauer Name oder `*.suffix`. Ein Treffer ueberspringt **nur** die Bereichspruefung;
 * https, Groessengrenzen und die erneute Pruefung jedes Sprungs bleiben.
 */
function istFreigestellt(name: string, erlaubt: readonly string[]): boolean {
  const klein = name.toLowerCase();
  return erlaubt.some((muster) =>
    muster.startsWith("*.")
      ? klein === muster.slice(2) || klein.endsWith(muster.slice(1))
      : klein === muster,
  );
}

export interface NetzOptionen {
  /** Rechnernamen, die die Bereichspruefung nicht durchlaufen. */
  readonly erlaubt?: readonly string[];
}

/**
 * Loest den Namen auf und laesst nur oeffentliche Adressen durch.
 *
 * Aufgeloest wird **mit `all: true`**: ein Name kann auf mehrere Adressen zeigen, und es
 * genuegt nicht, die erste zu pruefen. Zwischen dieser Pruefung und dem Verbindungsaufbau
 * bleibt ein Zeitfenster (DNS rebinding); es zu schliessen hiesse, die Verbindung selbst
 * an eine geprueft IP zu binden, und das kostet einen eigenen Agenten. Fuer einen
 * Zugang, der Herstellerdokumente holt, ist der Zaun hier die richtige Groesse.
 */
async function pruefeZiel(url: URL, erlaubt: readonly string[]): Promise<void> {
  if (url.protocol !== "https:") {
    throw new NetzFehler(`Nur https wird abgerufen, gelesen wurde "${url.protocol}".`);
  }

  const name = url.hostname.replace(/^\[|\]$/g, "");
  if (istFreigestellt(name, erlaubt)) return;

  // Steht dort schon eine IP, gibt es nichts aufzuloesen, aber sehr wohl zu pruefen.
  const ausDns = !isIPv4(name) && !isIPv6(name);
  const adressen = ausDns
    ? await lookup(name, { all: true })
        .then((treffer) => treffer.map((t) => t.address))
        .catch(() => {
          throw new NetzFehler(`Der Name "${name}" liess sich nicht aufloesen.`);
        })
    : [name];

  for (const roh of adressen) {
    const adresse = entpacke(roh);
    const getroffen = bereichVon(adresse);
    if (getroffen !== null) {
      const geschrieben = roh === adresse ? adresse : `${roh} (also ${adresse})`;
      throw new NetzFehler(
        `"${name}" zeigt auf ${geschrieben}${ausDns ? ", aufgeloest ueber DNS" : ""}, und ` +
          `das liegt in ${getroffen.cidr} (${getroffen.name}). Aus dem internen Netz wird ` +
          "nichts geholt.",
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
export async function holeSicher(
  roh: string,
  maxBytes: number,
  optionen: NetzOptionen = {},
): Promise<Geholt> {
  const erlaubt = optionen.erlaubt ?? [];
  let ziel: URL;
  try {
    ziel = new URL(roh);
  } catch {
    throw new NetzFehler(`"${roh}" ist keine gueltige Adresse.`);
  }

  for (let sprung = 0; sprung <= MAX_WEITERLEITUNGEN; sprung += 1) {
    try {
      await pruefeZiel(ziel, erlaubt);
    } catch (ursache) {
      // Welcher Sprung es war, steht sonst nirgends: die Adresse in der Meldung ist dann
      // eine, die der Aufrufer nie geschickt hat, und das liest sich wie ein Fehler im Zaun.
      if (sprung > 0 && ursache instanceof NetzFehler) {
        throw new NetzFehler(
          `Weiterleitung ${sprung} fuehrte auf ${ziel.href}, und dort gilt: ${ursache.message}`,
        );
      }
      throw ursache;
    }

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
