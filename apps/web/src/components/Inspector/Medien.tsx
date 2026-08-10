import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Crosshair, Download, FileWarning, Paperclip } from "lucide-react";
import { walk, type EditorModel, type EditorNode, type JsonValue } from "@aas-editor/core";

import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { SectionLabel } from "@/components/ui/section-label";
import { dateinameVon, normalisiere } from "@/lib/anhangspfade";
import { NO_ATTACHMENTS, useEditor } from "@/store/editor";
import { labelOf, pathTo } from "@/store/rows";
import { aasWorker } from "@/worker/bridge";

/**
 * Die Dateien zum gewaehlten Element: Bilder, PDFs und alles uebrige, was als Anhang im
 * Paket liegt.
 *
 * Gezeigt wird der **Teilbaum** der Auswahl, nicht nur das Element selbst. Ein
 * File-Element traegt seine Datei, ein Teilmodell die seiner Elemente, die Wurzel alle.
 * Das ist die einzige Regel, die sich beim Klicken durch den Baum vorhersagen laesst.
 *
 * Eine **Liste mit einer offenen Vorschau**, nicht acht Vorschauen untereinander: an der
 * Wurzel einer echten Herstellerdatei liegen leicht acht Anhaenge, und als volle Kaesten
 * ergaben sie eine Bahn, in der man nichts mehr findet.
 *
 * Sonderfall Verwaltungsschale: dort kommt das Vorschaubild dazu. Es kann an zwei Orten
 * liegen, und beide werden bedient: `assetInformation.defaultThumbnail` zeigt auf einen
 * Paketpfad, und ein AASX fuehrt zusaetzlich ein eigenes OPC-Thumbnail in der Wurzel.
 *
 * **Diese Flaeche zeigt an, sie bearbeitet nicht.** Waehlen, Ersetzen und Entfernen einer
 * Datei sitzen am `File`-Element im Formular, dort wo auch ihr Paketpfad steht. Zwei Orte
 * fuer dieselbe Handlung waeren zwei Orte, an denen sie auseinanderlaufen kann.
 */

/**
 * Mehr Dateien zeigt die Flaeche nicht auf einmal. Was wegfaellt, wird genannt und nicht
 * verschwiegen.
 */
const MAX_DATEIEN = 20;

interface Eintrag {
  readonly pfad: string;
  /** Woher der Pfad stammt, fuer die Beschriftung. */
  readonly art: "datei" | "thumbnail";
  /** Der idShort des File-Elements, sofern es eines gibt. */
  readonly name: string | null;
  /**
   * Der Knoten, zu dem die Datei gehoert: das File-Element, beim Vorschaubild die Schale.
   * Er traegt den Ort im Baum und den Sprung dorthin.
   */
  readonly nodeId: string;
}

/** Externe Verweise sind kein Paketanhang, sie werden nicht angezeigt. */
const IST_EXTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

function alsText(wert: JsonValue | undefined): string | null {
  return typeof wert === "string" && wert !== "" ? wert : null;
}

/** Der Pfad aus `assetInformation.defaultThumbnail`, falls die Schale einen setzt. */
function thumbnailPfad(node: EditorNode): string | null {
  const info = node.data["assetInformation"];
  if (typeof info !== "object" || info === null || Array.isArray(info)) return null;
  const thumb = (info as Record<string, JsonValue>)["defaultThumbnail"];
  if (typeof thumb !== "object" || thumb === null || Array.isArray(thumb)) return null;
  const pfad = alsText((thumb as Record<string, JsonValue>)["path"]);
  return pfad === null ? null : normalisiere(pfad);
}

function sammle(model: EditorModel, node: EditorNode): Eintrag[] {
  const gesehen = new Set<string>();
  const out: Eintrag[] = [];

  /*
   * Ein Durchgang durch den Teilbaum, zwei Quellen: das Vorschaubild **jeder** Schale
   * darin und jedes File-Element. Nur an der gewaehlten Schale zu suchen waere zu eng:
   * an der Wurzel fiele das Vorschaubild sonst weg, obwohl es im Paket liegt.
   */
  for (const kind of walk(model, node.nodeId)) {
    if (kind.kind === "AssetAdministrationShell") {
      const thumb = thumbnailPfad(kind);
      if (thumb !== null && !gesehen.has(thumb)) {
        gesehen.add(thumb);
        out.push({ pfad: thumb, art: "thumbnail", name: null, nodeId: kind.nodeId });
      }
      continue;
    }

    if (kind.kind !== "File") continue;
    const wert = alsText(kind.data["value"]);
    if (wert === null || IST_EXTERN.test(wert)) continue;
    const pfad = normalisiere(wert);
    if (gesehen.has(pfad)) continue;
    gesehen.add(pfad);
    out.push({
      pfad,
      art: "datei",
      name: alsText(kind.data["idShort"]),
      nodeId: kind.nodeId,
    });
  }

  return out;
}

export function Medien({ model, node }: { readonly model: EditorModel; readonly node: EditorNode }) {
  const { t } = useTranslation();
  const anhaengeBereit = useEditor((state) => state.anhaengeBereit);
  const hatThumbnail = useEditor((state) => state.meta?.hasThumbnail ?? false);

  /*
   * `useMemo` und **kein** Zustand-Selektor: ein Selektor, der eine neue Liste baut,
   * liefert bei jedem Rendern einen anderen Wert, Zustand vergleicht mit `Object.is` und
   * die Seite rendert sich zu Tode. Das sieht dann aus wie ein Netzwerkfehler.
   */
  const alle = useMemo(() => sammle(model, node), [model, node]);
  const eintraege = alle.slice(0, MAX_DATEIEN);
  const weggelassen = alle.length - eintraege.length;

  /*
   * Das Paket-Thumbnail springt nur ein, wenn im Teilbaum eine Schale liegt und keine
   * davon ein eigenes `defaultThumbnail` traegt. Sonst stuenden zwei Bilder desselben
   * Assets nebeneinander, oder es erschiene an einer Property, wo es nichts zu suchen hat.
   */
  const schale = useMemo(
    () => [...walk(model, node.nodeId)].find((k) => k.kind === "AssetAdministrationShell"),
    [model, node],
  );
  const paketThumbnail =
    hatThumbnail && schale !== undefined && !alle.some((eintrag) => eintrag.art === "thumbnail");

  /**
   * Welche Zeile offen ist: die **erste**, der Rest zu. So sieht man beim Wechsel des
   * Elements sofort etwas, ohne dass acht Vorschauen aufgehen.
   */
  const [offen, setOffen] = useState<string | null>(null);
  const erste = paketThumbnail ? "@paket" : (eintraege[0]?.pfad ?? null);
  useEffect(() => {
    setOffen(erste);
  }, [erste, node.nodeId]);

  if (!anhaengeBereit) {
    return (
      <Flaeche titel={t("medien.titel")}>
        <p className="px-1 text-xs text-muted-foreground">{t("medien.laedt")}</p>
      </Flaeche>
    );
  }

  if (eintraege.length === 0 && !paketThumbnail) {
    return (
      <Flaeche titel={t("medien.titel")}>
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>{t("medien.leer")}</EmptyTitle>
            <EmptyDescription>{t("medien.leerText")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Flaeche>
    );
  }

  return (
    <Flaeche titel={t("medien.titel")}>
      {paketThumbnail ? (
        <Zeile
          eintrag={{ pfad: "", art: "thumbnail", name: null, nodeId: schale?.nodeId ?? "" }}
          model={model}
          offen={offen === "@paket"}
          onUmschalten={() => setOffen(offen === "@paket" ? null : "@paket")}
        />
      ) : null}
      {eintraege.map((eintrag) => (
        <Zeile
          key={eintrag.pfad}
          eintrag={eintrag}
          model={model}
          offen={offen === eintrag.pfad}
          onUmschalten={() => setOffen(offen === eintrag.pfad ? null : eintrag.pfad)}
        />
      ))}
      {weggelassen > 0 ? (
        <p className="px-1 text-2xs text-foreground-faint" data-numeric>
          {t("medien.weitere", { count: weggelassen })}
        </p>
      ) : null}
    </Flaeche>
  );
}

function Flaeche({ titel, children }: { readonly titel: string; readonly children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto px-5 py-4">
      <SectionLabel className="block">{titel}</SectionLabel>
      {children}
    </div>
  );
}

interface Geladen {
  readonly url: string;
  readonly contentType: string;
  readonly groesse: number;
}

/**
 * Holt die Bytes aus dem Worker und macht daraus eine Adresse, die ein `img` oder ein
 * `iframe` anzeigen kann.
 *
 * `getAttachment` gibt bereits eine **Kopie** zurueck, der Anhang bleibt im Worker also
 * vollstaendig; ohne das waere er nach dem ersten Ansehen beim naechsten Export weg.
 *
 * Die Adresse wird im Aufraeumen wieder freigegeben. Ohne das haelt jeder Klick im Baum
 * eine weitere Datei im Speicher fest, und bei Datenblaettern sind das Megabytes.
 *
 * @param aktiv Falsch heisst: gar nicht erst holen. So bleibt ein 1,3-MB-PDF liegen,
 * solange niemand es ansieht.
 */
function useBytes(pfad: string | null, aktiv: boolean, stand: number) {
  const [geladen, setGeladen] = useState<Geladen | null>(null);
  const [fehlt, setFehlt] = useState(false);

  useEffect(() => {
    if (!aktiv) {
      setGeladen(null);
      setFehlt(false);
      return;
    }

    let gilt = true;
    let adresse: string | null = null;

    // Der Pfad ist die einzige Abhaengigkeit. Eine hereingereichte Ladefunktion waere bei
    // jedem Rendern eine neue und muesste umstaendlich vom Vergleich ausgenommen werden.
    const hole = () =>
      pfad === null || pfad === "" ? aasWorker().getThumbnail() : aasWorker().getAttachment(pfad);

    void hole()
      .then((treffer) => {
        if (!gilt) return;
        if (!treffer) {
          setFehlt(true);
          return;
        }
        adresse = URL.createObjectURL(
          new Blob([treffer.bytes as BlobPart], { type: treffer.contentType }),
        );
        setFehlt(false);
        setGeladen({
          url: adresse,
          contentType: treffer.contentType,
          groesse: treffer.bytes.length,
        });
      })
      .catch(() => {
        if (gilt) setFehlt(true);
      });

    return () => {
      gilt = false;
      if (adresse !== null) URL.revokeObjectURL(adresse);
      setGeladen(null);
    };
    // `stand` gehoert in die Abhaengigkeiten, obwohl er im Rumpf nicht vorkommt: beim
    // Ersetzen bleibt der Pfad derselbe, nur die Bytes dahinter sind neue. Ohne ihn
    // zeigte die Vorschau weiter das alte Bild.
  }, [pfad, aktiv, stand]);

  return { geladen, fehlt };
}

/**
 * Holt die Bytes erst beim Klick und bietet sie als Datei an.
 *
 * Ein `<a href>` haette die Adresse vorab gebraucht, und damit muesste jede Zeile ihre
 * Bytes im Voraus laden, auch das 1,3-MB-Datenblatt, das niemand ansieht. So traegt jede
 * Zeile ihren Knopf, ohne dass etwas geladen wird, bis jemand ihn drueckt.
 *
 * Der Dateiname kommt aus dem **Paketpfad**, nicht aus dem idShort: der idShort beschreibt
 * die Rolle im Modell (`DigitalFile`), der Pfad die Datei (`demo.stp`). Ohne ihn landet
 * eine Datei ohne Endung im Downloadordner.
 */
async function herunterladen(pfad: string, dateiname: string, typ: string): Promise<void> {
  const treffer =
    pfad === "" ? await aasWorker().getThumbnail() : await aasWorker().getAttachment(pfad);
  if (!treffer) return;

  const adresse = URL.createObjectURL(
    new Blob([treffer.bytes as BlobPart], { type: treffer.contentType || typ }),
  );
  const anker = document.createElement("a");
  anker.href = adresse;
  anker.download = dateiname;
  anker.click();
  URL.revokeObjectURL(adresse);
}

function istBild(contentType: string, pfad: string): boolean {
  if (contentType.startsWith("image/")) return true;
  // Ohne Anhang kennen wir den Typ noch nicht; die Endung ist dann der beste Anhaltspunkt.
  return /\.(png|jpe?g|gif|webp|svg|bmp|tiff?)$/i.test(pfad);
}

function Zeile({
  eintrag,
  model,
  offen,
  onUmschalten,
}: {
  readonly eintrag: Eintrag;
  readonly model: EditorModel;
  readonly offen: boolean;
  readonly onUmschalten: () => void;
}) {
  const { t } = useTranslation();
  const anhaenge = useEditor((state) => state.meta?.attachments ?? NO_ATTACHMENTS);
  const goToNode = useEditor((state) => state.goToNode);
  const stand = useEditor((state) => state.anhangStand);
  // `NO_ATTACHMENTS` ist eine stabile Leerliste: ein `?? []` im Selektor liefert bei jedem
  // Rendern ein neues Array und dreht die Seite in eine Endlosschleife.

  const istPaketThumbnail = eintrag.pfad === "";
  const bildhaft = istBild("", eintrag.pfad);
  // Ein Bild wird immer geholt, es traegt das Miniaturbild. Alles andere erst beim Oeffnen.
  const { geladen, fehlt } = useBytes(
    eintrag.pfad,
    offen || bildhaft || istPaketThumbnail,
    stand,
  );

  /*
   * Typ und Groesse stehen in der Anhangsliste und brauchen die Bytes **nicht**. Nur so
   * tragen alle Zeilen ihre Groesse und ihren Download-Knopf, auch die eines
   * 1,3-MB-Datenblatts, das noch niemand geoeffnet hat.
   */
  const info = anhaenge.find((eintragung) => eintragung.path === eintrag.pfad);
  const groesseBytes = geladen?.groesse ?? info?.size ?? null;
  const typ = geladen?.contentType ?? info?.contentType ?? "";
  const vorhanden = istPaketThumbnail ? !fehlt : info !== undefined;

  const dateiname = istPaketThumbnail ? "thumbnail" : dateinameVon(eintrag.pfad);
  const beschriftung = eintrag.name ?? dateiname;
  /*
   * Der Ort im Baum, nicht der Paketpfad: drei Zeilen heissen "DigitalFile", und was sie
   * unterscheidet, ist ihr Platz im Modell. `pathTo` folgt dabei der Anzeige des Baums,
   * ein Teilmodell steht darin unter seiner Schale.
   */
  const ort = useMemo(() => {
    if (eintrag.nodeId === "" || !model.nodes[eintrag.nodeId]) return "";
    const kette = pathTo(model, eintrag.nodeId);
    // Ohne das Element selbst: sein Name steht schon eine Zeile darueber.
    return kette
      .slice(0, -1)
      .map((id) => {
        const knoten = model.nodes[id];
        return knoten ? labelOf(knoten) : id;
      })
      .join(" › ");
  }, [model, eintrag.nodeId]);
  const bild = geladen !== null && istBild(geladen.contentType, eintrag.pfad);
  const pdf = geladen?.contentType === "application/pdf";

  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-card">
      <div className="flex items-center gap-2.5 px-3 py-2">
        <button
          type="button"
          onClick={onUmschalten}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          aria-expanded={offen}
        >
          <ChevronDown
            aria-hidden
            className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${offen ? "" : "-rotate-90"}`}
          />
          {/* Das Miniaturbild traegt die Wiedererkennung; ohne es sind acht Zeilen gleich. */}
          <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-foreground/8">
            {bild && geladen ? (
              <img src={geladen.url} alt="" className="max-h-full max-w-full object-contain" />
            ) : (
              <Paperclip aria-hidden className="size-3.5 text-muted-foreground" />
            )}
          </span>
          <span className="flex min-w-0 flex-1 flex-col" title={eintrag.pfad || dateiname}>
            <span className="truncate text-sm font-medium">{beschriftung}</span>
            {/*
             * Der Paketpfad als zweite Zeile. Er ist es, der die Dateien unterscheidet:
             * der idShort beschreibt die **Rolle** im Modell, und die heisst in einer
             * HandoverDocumentation dreimal hintereinander "DigitalFile".
             *
             * Nur wenn er etwas Neues sagt: heisst die Zeile ohnehin nach ihrer Datei,
             * wie beim Vorschaubild, stuende sonst zweimal dasselbe da.
             */}
            {ort === "" ? null : (
              <span className="truncate text-2xs text-foreground-faint">{ort}</span>
            )}
          </span>
          {eintrag.art === "thumbnail" ? (
            <Chip tone="aas" size="sm">
              {t("medien.vorschaubild")}
            </Chip>
          ) : null}
        </button>

        {groesseBytes !== null ? (
          <span className="shrink-0 font-mono text-2xs text-foreground-faint" data-numeric>
            {groesse(groesseBytes)}
          </span>
        ) : null}

        <div className="flex shrink-0 items-center gap-1">
          {eintrag.nodeId === "" ? null : (
            <Button
              variant="ghost"
              size="icon-xs"
              title={t("medien.imBaum")}
              aria-label={t("medien.imBaum")}
              onClick={() => goToNode(eintrag.nodeId)}
            >
              <Crosshair />
            </Button>
          )}
          {vorhanden ? (
            <Button
              variant="ghost"
              size="icon-xs"
              title={t("medien.herunterladen")}
              aria-label={t("medien.herunterladen")}
              onClick={() => void herunterladen(eintrag.pfad, dateiname, typ)}
            >
              <Download />
            </Button>
          ) : null}
        </div>
      </div>

      {offen ? (
        <div className="border-t border-border">
          {fehlt ? (
            <p className="flex items-center gap-1.5 px-3 py-2.5 text-xs text-warning-text">
              <FileWarning className="size-3.5 shrink-0" />
              {t("inspektor.keinAnhang")}
            </p>
          ) : !geladen ? (
            <p className="px-3 py-2.5 text-xs text-muted-foreground">{t("medien.laedt")}</p>
          ) : bild ? (
            // Fester Kasten, Bild **ohne** `w-full`: ein 1,6-KB-Logo bleibt klein, statt
            // auf Fensterbreite gezogen und dabei unscharf zu werden. Heller Grund, sonst
            // ist ein transparentes PNG auf der dunklen Flaeche nicht zu erkennen.
            <div className="flex h-[280px] items-center justify-center bg-foreground/8 p-4">
              <img
                src={geladen.url}
                alt={beschriftung}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ) : pdf ? (
            // `#toolbar=0&navpanes=0&view=FitH`: die eingebaute Anzeige des Browsers ohne
            // ihre Werkzeugleiste, die Seite auf Breite. pdf.js waere groesser als das
            // gesamte Startbuendel und fuer ein Datenblatt nicht noetig.
            <iframe
              src={`${geladen.url}#toolbar=0&navpanes=0&view=FitH`}
              title={beschriftung}
              className="h-[520px] w-full border-0 bg-canvas"
            />
          ) : (
            <div className="flex items-center gap-2.5 px-3 py-3">
              <Paperclip aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              {/* Dateiname **und** Typ: der Name sagt, was es ist, der Typ, womit es sich
                  oeffnen laesst. Der Name allein stand schon oben in der Zeile, dort aber
                  als idShort des Elements, und das ist etwas anderes. */}
              <span className="min-w-0 truncate font-mono text-2xs">
                {dateiname}
                <span className="ml-2 text-mono-foreground">{geladen.contentType}</span>
              </span>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto shrink-0"
                onClick={() => void herunterladen(eintrag.pfad, dateiname, geladen.contentType)}
              >
                <Download data-icon="inline-start" />
                {t("medien.herunterladen")}
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

export function groesse(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
