import {
  childSlotsOf,
  isJsonObject,
  search,
  submodelsJeShell,
  type EditorModel,
  type EditorNode,
  type JsonValue,
  type NodeId,
  type ShellZuordnung,
} from "@aas-editor/core";

/**
 * Der Baum als flache Liste sichtbarer Zeilen.
 *
 * Plan Abschnitt 8: der Baum wird aus dem normalisierten Store abgeleitet und mit
 * TanStack Virtual gerendert, statt eine fertige Baumkomponente zu nehmen. Bei einem
 * normalisierten Store ist das wenig Aufwand und gibt volle Kontrolle ueber Tastatur
 * und Drag-and-drop.
 *
 * **Die Anzeige weicht bewusst vom Modell ab (seit 06.08.2026).** Im Metamodell sind alle
 * Identifiables Geschwister unter `Environment`, und `AssetAdministrationShell.submodels`
 * ist eine Liste von Verweisen. Der Baum zeigt stattdessen die Ordnung, die man erwartet:
 * unter jeder Shell die Submodels, auf die sie zeigt, daneben ein Ordner je uebriger Liste.
 * Geaendert wird dafuer **nur diese Ableitung**; ein Umbau des Modells zoege Normalisierer,
 * Export, Validierung und Zwischenablage mit.
 */

/**
 * Kennung einer Ordnerzeile. Echte Knoten heissen `n0`, `n1`, ..., eine Kollision ist
 * damit ausgeschlossen.
 */
const ORDNER = "slot:";

export function ordnerId(slot: string): NodeId {
  return `${ORDNER}${slot}`;
}

export function istOrdner(nodeId: NodeId | null): boolean {
  return nodeId !== null && nodeId.startsWith(ORDNER);
}

/** Beschriftung einer Ordnerzeile. AAS-Begriffe bleiben unuebersetzt (Entscheidung 28.07.). */
const ORDNER_LABEL: Record<string, string> = {
  submodels: "Submodels",
  conceptDescriptions: "ConceptDescriptions",
};

export interface TreeRow {
  readonly nodeId: NodeId;
  readonly depth: number;
  readonly kind: string;
  /** Anzeigename: idShort, sonst der Typ */
  readonly label: string;
  /** Fachliche id, nur bei Identifiables gesetzt */
  readonly id: string | null;
  /**
   * Unterscheidungsmerkmal, wenn Geschwister denselben idShort tragen (Plan Abschnitt 6).
   * Version aus `administration`, sonst gekuerzte `id`, sonst `semanticId`.
   */
  readonly disambiguator: string | null;
  /** Treffer der laufenden Suche, nur zur Hervorhebung */
  readonly matched: boolean;
  /**
   * Eine Sammelzeile fuer eine Liste des Environments, kein echter Knoten. Sie laesst sich
   * nicht loeschen, nicht duplizieren und nicht im Formular oeffnen.
   */
  readonly ordner: boolean;
  readonly hasChildren: boolean;
  /** Zahl der Kinder ueber alle Slots, fuer den Zaehler rechts in der Zeile */
  readonly childCount: number;
  readonly expanded: boolean;
  /** Slot im Elternteil, null bei der Wurzel */
  readonly slot: string | null;
  /** Position innerhalb des Slots */
  readonly index: number;
  readonly parentId: NodeId | null;
  /**
   * Stellung unter allen Geschwistern, ueber alle Slots hinweg, eins-basiert. Ein
   * virtualisierter Baum zeigt nur einen Ausschnitt; ohne diese beiden Angaben zaehlt
   * ein Bildschirmleser nur die gerade gerenderten Zeilen.
   */
  readonly posinset: number;
  readonly setsize: number;
}

/** Anzeigename eines Knotens: idShort, sonst der Typ. Wie in der Baumzeile. */
export function labelOf(node: EditorNode): string {
  const idShort = node.data["idShort"];
  return typeof idShort === "string" && idShort.length > 0 ? idShort : node.kind;
}

export function buildRows(
  model: EditorModel,
  expanded: Record<NodeId, true>,
  filter = "",
): TreeRow[] {
  const rows: TreeRow[] = [];

  // Beim Filtern zeigt der Baum die Treffer **mit ihrer Elternkette**, damit sie im
  // Zusammenhang stehen bleiben. Ein Treffer ohne sein Submodel waere wertlos.
  const zuordnung = submodelsJeShell(model);

  const treffer =
    filter.trim() === "" ? null : new Set(search(model, filter, 500).map((h) => h.nodeId));
  const sichtbar = treffer ? withAncestors(model, treffer, zuordnung) : null;

  /**
   * Die Kinder einer Zeile, wie der Baum sie zeigt.
   *
   * Bei einer Shell sind das die verwiesenen Submodels; sie stehen im Modell nicht unter
   * ihr, sondern als Verweisliste in ihren Daten.
   */
  const kinder = (node: EditorNode): { slot: string; ids: readonly NodeId[] }[] => {
    if (node.kind === "AssetAdministrationShell") {
      return [{ slot: "submodels", ids: zuordnung.jeShell.get(node.nodeId) ?? [] }];
    }
    return childSlotsOf(node.kind)
      .map((entry) => ({ slot: entry.name, ids: node.children[entry.name] ?? [] }))
      .filter((entry) => entry.ids.length > 0);
  };

  // Wie oft ein idShort unter denselben Geschwistern vorkommt, je Slot einmal gezaehlt.
  // Frueher lief das je Zeile ueber die ganze Geschwisterliste: in einer Sammlung mit
  // zweitausend Kindern sind das vier Millionen Zugriffe je Baumaufbau.
  const haeufigkeit = new Map<string, Map<string, number>>();
  const zaehleGeschwister = (parentId: NodeId, slot: string): Map<string, number> => {
    const schluessel = `${parentId}/${slot}`;
    const vorhanden = haeufigkeit.get(schluessel);
    if (vorhanden) return vorhanden;

    const zaehler = new Map<string, number>();
    for (const id of model.nodes[parentId]?.children[slot] ?? []) {
      const idShort = model.nodes[id]?.data["idShort"];
      if (typeof idShort === "string" && idShort !== "") {
        zaehler.set(idShort, (zaehler.get(idShort) ?? 0) + 1);
      }
    }
    haeufigkeit.set(schluessel, zaehler);
    return zaehler;
  };

  const visit = (
    nodeId: NodeId,
    depth: number,
    slot: string | null,
    index: number,
    parentId: NodeId | null,
    posinset: number,
    setsize: number,
  ): void => {
    const node = model.nodes[nodeId];
    if (!node) return;
    if (sichtbar && !sichtbar.has(nodeId)) return;

    const slots = kinder(node);
    let hasChildren = false;
    let childCount = 0;
    for (const entry of slots) {
      const ids = entry.ids;
      // Der Zaehler nennt den tatsaechlichen Bestand, auch wenn ein Filter laeuft: die
      // gefilterte Zahl waere eine andere Aussage und wuerde beim Tippen springen.
      childCount += ids.length;
      if (sichtbar ? ids.some((id) => sichtbar.has(id)) : ids.length > 0) hasChildren = true;
    }

    // Beim Filtern wird alles aufgeklappt, sonst faende man die Treffer nicht.
    const isOpen = sichtbar ? true : Boolean(expanded[nodeId]);
    const idShort = node.data["idShort"];
    const id = node.data["id"];

    rows.push({
      nodeId,
      depth,
      kind: node.kind,
      label: typeof idShort === "string" && idShort.length > 0 ? idShort : node.kind,
      id: typeof id === "string" ? id : null,
      disambiguator: disambiguatorOf(
        node,
        parentId && slot ? zaehleGeschwister(parentId, slot) : null,
      ),
      matched: treffer ? treffer.has(nodeId) : false,
      ordner: false,
      hasChildren,
      childCount,
      expanded: isOpen,
      slot,
      index,
      parentId,
      posinset,
      setsize,
    });

    if (!isOpen || !hasChildren) return;
    // Die Stellung zaehlt ueber alle Slots hinweg: fuer den Bildschirmleser sind alle
    // Kinder eines Knotens **eine** Ebene, unabhaengig davon, in welchem Slot sie haengen.
    let stellung = 0;
    for (const entry of slots) {
      for (let i = 0; i < entry.ids.length; i += 1) {
        stellung += 1;
        visit(entry.ids[i] as NodeId, depth + 1, entry.slot, i, nodeId, stellung, childCount);
      }
    }
  };

  /** Eine Sammelzeile fuer eine Liste des Environments, samt ihrer Kinder. */
  const ordnerZeile = (slot: string, ids: readonly NodeId[], posinset: number, setsize: number) => {
    const eigene = sichtbar ? ids.filter((id) => sichtbar.has(id)) : ids;
    if (eigene.length === 0) return;

    const nodeId = ordnerId(slot);
    const isOpen = sichtbar ? true : Boolean(expanded[nodeId]);
    rows.push({
      nodeId,
      depth: 1,
      kind: slot,
      label: ORDNER_LABEL[slot] ?? slot,
      id: null,
      disambiguator: null,
      matched: false,
      ordner: true,
      hasChildren: true,
      childCount: ids.length,
      expanded: isOpen,
      slot,
      index: 0,
      parentId: model.rootId,
      posinset,
      setsize,
    });
    if (!isOpen) return;
    for (let i = 0; i < ids.length; i += 1) {
      visit(ids[i] as NodeId, 2, slot, i, nodeId, i + 1, ids.length);
    }
  };

  // --- Die Wurzel von Hand, weil ihre Kinder anders geordnet werden als im Modell -----
  const wurzel = model.nodes[model.rootId];
  if (!wurzel) return rows;

  const shells = wurzel.children["assetAdministrationShells"] ?? [];
  const cds = wurzel.children["conceptDescriptions"] ?? [];
  const sichtbareShells = sichtbar ? shells.filter((id) => sichtbar.has(id)) : shells;
  const hatFreie =
    (sichtbar ? zuordnung.frei.filter((id) => sichtbar.has(id)) : zuordnung.frei).length > 0;
  const hatCds = (sichtbar ? cds.filter((id) => sichtbar.has(id)) : cds).length > 0;

  const kinderDerWurzel = sichtbareShells.length + (hatFreie ? 1 : 0) + (hatCds ? 1 : 0);
  const wurzelOffen = sichtbar ? true : Boolean(expanded[model.rootId]);

  rows.push({
    nodeId: model.rootId,
    depth: 0,
    kind: wurzel.kind,
    label: wurzel.kind,
    id: null,
    disambiguator: null,
    matched: treffer ? treffer.has(model.rootId) : false,
    ordner: false,
    hasChildren: kinderDerWurzel > 0,
    childCount: kinderDerWurzel,
    expanded: wurzelOffen,
    slot: null,
    index: 0,
    parentId: null,
    posinset: 1,
    setsize: 1,
  });

  if (wurzelOffen && kinderDerWurzel > 0) {
    let stellung = 0;
    for (let i = 0; i < shells.length; i += 1) {
      stellung += 1;
      visit(
        shells[i] as NodeId,
        1,
        "assetAdministrationShells",
        i,
        model.rootId,
        stellung,
        kinderDerWurzel,
      );
    }
    if (hatFreie) {
      stellung += 1;
      ordnerZeile("submodels", zuordnung.frei, stellung, kinderDerWurzel);
    }
    if (hatCds) ordnerZeile("conceptDescriptions", cds, stellung + 1, kinderDerWurzel);
  }

  return rows;
}

/**
 * Die Treffer plus alle ihre Vorfahren, damit der Baum zusammenhaengend bleibt.
 *
 * "Vorfahre" heisst hier **wie der Baum ihn zeigt**: ein Submodel haengt unter seiner Shell,
 * nicht unter dem Environment. Ohne diese Zeile verschwaende ein gefundenes Submodel, weil
 * seine Shell nicht als sichtbar gilt.
 */
function withAncestors(
  model: EditorModel,
  treffer: ReadonlySet<NodeId>,
  zuordnung: ShellZuordnung,
): Set<NodeId> {
  const out = new Set<NodeId>();
  for (const nodeId of treffer) {
    let current: NodeId | null = nodeId;
    while (current !== null && !out.has(current)) {
      out.add(current);
      const shell = zuordnung.shellVon.get(current);
      current = shell ?? model.nodes[current]?.parent ?? null;
    }
  }
  return out;
}

/**
 * Unterscheidungsmerkmal, wenn Geschwister denselben idShort tragen.
 *
 * Plan Abschnitt 6: gleicher idShort bei verschiedener id ist **kein Fehler**, sondern
 * ein legitimer Fall (Versionierung, parallele Varianten). Statt einer Warnung zeigt die
 * Oberflaeche, was die beiden unterscheidet.
 */
function disambiguatorOf(
  node: EditorNode,
  haeufigkeit: ReadonlyMap<string, number> | null,
): string | null {
  const idShort = node.data["idShort"];
  if (typeof idShort !== "string" || idShort === "" || !haeufigkeit) return null;
  if ((haeufigkeit.get(idShort) ?? 0) < 2) return null;

  const administration = node.data["administration"];
  if (isJsonObject(administration)) {
    const version = administration["version"];
    const revision = administration["revision"];
    if (typeof version === "string" && version) {
      return typeof revision === "string" && revision ? `v${version}.${revision}` : `v${version}`;
    }
  }

  const id = node.data["id"];
  if (typeof id === "string" && id) return shortenMiddle(id, 28);

  return semanticIdOf(node.data["semanticId"]);
}

function semanticIdOf(reference: JsonValue | undefined): string | null {
  if (!isJsonObject(reference)) return null;
  const keys = reference["keys"];
  if (!Array.isArray(keys) || keys.length === 0) return null;
  const first = keys[0];
  if (!isJsonObject(first)) return null;
  const value = first["value"];
  return typeof value === "string" && value ? shortenMiddle(value, 28) : null;
}

/** Ordnet jeder nodeId ihre Zeilennummer zu, fuer Auswahl und Tastaturwege. */
export function indexRows(rows: readonly TreeRow[]): Map<NodeId, number> {
  const index = new Map<NodeId, number>();
  for (let i = 0; i < rows.length; i += 1) index.set(rows[i]!.nodeId, i);
  return index;
}

/**
 * Der Pfad von der Wurzel zum Knoten, fuer die Brotkrumen.
 *
 * Folgt derselben Ableitung wie der Baum, nicht dem Modell: bei einem Submodel steht die
 * Shell dazwischen. Sonst naennten Baum und Formular verschiedene Pfade fuer dasselbe
 * Element.
 */
export function pathTo(model: EditorModel, nodeId: NodeId): NodeId[] {
  const { shellVon } = submodelsJeShell(model);
  const path: NodeId[] = [];
  let current: NodeId | null = nodeId;
  while (current !== null) {
    path.unshift(current);
    const shell = shellVon.get(current);
    current = shell ?? model.nodes[current]?.parent ?? null;
  }
  return path;
}

/**
 * Lange IDs mittig kuerzen statt am Ende abschneiden (Plan Abschnitt 8): hinten steht
 * meist der unterscheidende Teil.
 */
export function shortenMiddle(value: string, max = 44): string {
  if (value.length <= max) return value;
  const half = Math.floor((max - 1) / 2);
  return `${value.slice(0, half)}…${value.slice(value.length - half)}`;
}
