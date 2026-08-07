import { normalize, type JsonObject } from "@aas-editor/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Die Werkzeuge des Assistenten am offenen Modell.
 *
 * Der Worker und der Entwurfsspeicher haengen an Browser-APIs, die es hier nicht gibt.
 * Beide werden ersetzt: geprueft wird, was die Werkzeuge am Modell **tun**, nicht dass
 * eine Aenderung auch im Worker ankommt; dafuer gibt es die Playwright-Laeufe.
 */

vi.mock("../src/worker/bridge", () => ({
  aasWorker: () => ({
    applyPatches: () => Promise.resolve(),
    validate: () => Promise.resolve([]),
    setModel: () => Promise.resolve(),
  }),
}));
vi.mock("../src/store/autosave", () => ({
  createAutosave: () => () => undefined,
  ladeEntwurf: () => Promise.resolve(null),
  loescheEntwurf: () => Promise.resolve(),
}));

// `store/editor.ts` haengt im Entwicklungsmodus eine Sonde an `window`. Die Werkzeuge
// selbst brauchen kein DOM, deshalb genuegt hier eine Attrappe statt einer jsdom-Umgebung.
(globalThis as unknown as Record<string, unknown>)["window"] = globalThis;

const { fuehreWerkzeugAus } = await import("../src/assistent/ausfuehren");
const { useEditor } = await import("../src/store/editor");

const UMGEBUNG: JsonObject = {
  assetAdministrationShells: [
    {
      modelType: "AssetAdministrationShell",
      id: "https://example.com/aas/1",
      idShort: "Maschine",
      assetInformation: { assetKind: "Instance" },
      submodels: [
        { type: "ModelReference", keys: [{ type: "Submodel", value: "https://example.com/sm/1" }] },
      ],
    },
  ],
  conceptDescriptions: [],
  submodels: [
    {
      modelType: "Submodel",
      id: "https://example.com/sm/1",
      idShort: "Nameplate",
      submodelElements: [
        { modelType: "Property", idShort: "Hersteller", valueType: "xs:string", value: "Dogan" },
        { modelType: "Property", idShort: "Baujahr", valueType: "xs:string", value: "2026" },
      ],
    },
  ],
};

function knotenMit(idShort: string): string {
  const model = useEditor.getState().model;
  const treffer = Object.values(model?.nodes ?? {}).find((n) => n.data["idShort"] === idShort);
  if (!treffer) throw new Error(`Kein Knoten ${idShort}`);
  return treffer.nodeId;
}

function ergebnisVon(name: string, argumente: Record<string, unknown> = {}) {
  const ergebnis = fuehreWerkzeugAus(name, argumente);
  return { ...ergebnis, wert: JSON.parse(ergebnis.ausgabe) as Record<string, unknown> };
}

beforeEach(() => {
  useEditor.setState({
    model: normalize(UMGEBUNG),
    selection: null,
    issues: [],
    dirty: false,
    projektId: null,
    projektName: "Probe",
    meta: null,
  });
});

describe("lesende Werkzeuge", () => {
  it("modell_ueberblick nennt Schale und Teilmodell", () => {
    const { wert, istFehler } = ergebnisVon("modell_ueberblick");
    expect(istFehler).toBe(false);
    expect(wert["projekt"]).toBe("Probe");
    expect(JSON.stringify(wert)).toContain("Nameplate");
  });

  it("baum_lesen beginnt ohne nodeId an der Wurzel", () => {
    const { wert } = ergebnisVon("baum_lesen", { nodeId: null, tiefe: 2 });
    expect(JSON.stringify(wert)).toContain("Nameplate");
  });

  it("element_lesen liefert Daten und Feldnamen", () => {
    const { wert } = ergebnisVon("element_lesen", { nodeId: knotenMit("Hersteller") });
    expect((wert["daten"] as Record<string, unknown>)["value"]).toBe("Dogan");
    expect(wert["felder"]).toContain("idShort");
  });

  it("suchen findet ueber den Wert", () => {
    const { wert } = ergebnisVon("suchen", { text: "Dogan", limit: null });
    expect((wert["treffer"] as unknown[]).length).toBe(1);
  });

  it("finden loest id, idShort und Pfad auf", () => {
    const ueberId = ergebnisVon("finden", {
      id: "https://example.com/sm/1",
      idShort: null,
      aasPath: null,
    });
    expect((ueberId.wert["treffer"] as unknown[]).length).toBe(1);

    const ueberIdShort = ergebnisVon("finden", { id: null, idShort: "Baujahr", aasPath: null });
    expect((ueberIdShort.wert["treffer"] as unknown[]).length).toBe(1);

    const ueberPfad = ergebnisVon("finden", {
      id: null,
      idShort: null,
      aasPath: ".submodels[0].submodelElements[0]",
    });
    expect((ueberPfad.wert["treffer"] as unknown[]).length).toBe(1);
  });

  it("finden ohne jedes Feld sagt, was fehlt", () => {
    const { istFehler } = ergebnisVon("finden", { id: null, idShort: null, aasPath: null });
    expect(istFehler).toBe(true);
  });

  it("befunde_lesen liefert die Befunde des Editors", () => {
    useEditor.setState({
      issues: [
        {
          severity: "constraint",
          schluessel: "befund.regel.AASd-022",
          werte: {},
          message: "idShort not unique",
          constraintId: "AASd-022",
          aasPath: ".submodels[0]",
          nodeId: knotenMit("Nameplate"),
          field: "",
        },
      ],
    });
    const { wert } = ergebnisVon("befunde_lesen", { nodeId: null });
    expect(wert["anzahl"]).toBe(1);
  });

  it("auswahl_lesen meldet nichts, solange nichts gewaehlt ist", () => {
    expect(ergebnisVon("auswahl_lesen").wert["auswahl"]).toBeNull();
  });
});

describe("schreibende Werkzeuge", () => {
  it("auswaehlen setzt die Auswahl im Baum", () => {
    const nodeId = knotenMit("Baujahr");
    ergebnisVon("auswaehlen", { nodeId });
    expect(useEditor.getState().selection).toBe(nodeId);
  });

  it("feld_setzen aendert einen einfachen Wert", () => {
    const nodeId = knotenMit("Hersteller");
    ergebnisVon("feld_setzen", { nodeId, feld: "value", wert: "Neu", wertJson: null });
    expect(useEditor.getState().model?.nodes[nodeId]?.data["value"]).toBe("Neu");
  });

  it("feld_setzen nimmt verschachtelte Werte als JSON-Text", () => {
    const nodeId = knotenMit("Nameplate");
    ergebnisVon("feld_setzen", {
      nodeId,
      feld: "description",
      wert: null,
      wertJson: JSON.stringify([{ language: "de", text: "Typenschild" }]),
    });
    const gesetzt = useEditor.getState().model?.nodes[nodeId]?.data["description"];
    expect(Array.isArray(gesetzt)).toBe(true);
  });

  it("element_anlegen legt an und uebernimmt den idShort", () => {
    const eltern = knotenMit("Nameplate");
    const { wert, istFehler } = ergebnisVon("element_anlegen", {
      elternId: eltern,
      slot: "submodelElements",
      art: "Property",
      idShort: "Seriennummer",
      id: null,
    });
    expect(istFehler).toBe(false);
    expect(wert["idShort"]).toBe("Seriennummer");
    expect(knotenMit("Seriennummer")).toBeTruthy();
  });

  it("element_anlegen nennt die moeglichen Slots, wenn der Slot nicht passt", () => {
    const { istFehler, anzeige } = ergebnisVon("element_anlegen", {
      elternId: knotenMit("Nameplate"),
      slot: "annotations",
      art: "Property",
      idShort: null,
      id: null,
    });
    expect(istFehler).toBe(true);
    expect(anzeige).toContain("submodelElements");
  });

  it("element_loeschen entfernt den Knoten", () => {
    const nodeId = knotenMit("Baujahr");
    ergebnisVon("element_loeschen", { nodeId });
    expect(useEditor.getState().model?.nodes[nodeId]).toBeUndefined();
  });

  it("element_verschieben haengt um", () => {
    const nodeId = knotenMit("Baujahr");
    const ziel = knotenMit("Nameplate");
    const { istFehler } = ergebnisVon("element_verschieben", {
      nodeId,
      zielId: ziel,
      slot: "submodelElements",
      index: 0,
    });
    expect(istFehler).toBe(false);
    expect(useEditor.getState().model?.nodes[ziel]?.children["submodelElements"]?.[0]).toBe(nodeId);
  });

  it("element_duplizieren erzeugt eine zweite Zeile", () => {
    const vorher = Object.keys(useEditor.getState().model?.nodes ?? {}).length;
    const { istFehler } = ergebnisVon("element_duplizieren", { nodeId: knotenMit("Hersteller") });
    expect(istFehler).toBe(false);
    expect(Object.keys(useEditor.getState().model?.nodes ?? {}).length).toBe(vorher + 1);
  });

  it("teilbaum_einfuegen legt ein ganzes Teilmodell in einem Aufruf an", () => {
    const { istFehler } = ergebnisVon("teilbaum_einfuegen", {
      elternId: useEditor.getState().model?.rootId,
      slot: "submodels",
      json: JSON.stringify({
        modelType: "Submodel",
        id: "https://example.com/sm/2",
        idShort: "Technikdaten",
        submodelElements: [
          { modelType: "Property", idShort: "Leistung", valueType: "xs:string", value: "5 kW" },
          { modelType: "Property", idShort: "Spannung", valueType: "xs:string", value: "400 V" },
        ],
      }),
    });
    expect(istFehler).toBe(false);
    expect(knotenMit("Technikdaten")).toBeTruthy();
    expect(knotenMit("Leistung")).toBeTruthy();
  });

  /**
   * Der Store faengt Kernfehler ab und zeigt sie dem Nutzer als Meldung; die Aktion gibt
   * danach ganz normal zurueck. Ohne die Wirkungspruefung meldete der Assistent hier
   * "geloescht", waehrend das Modell unveraendert dasteht, und baute darauf auf.
   */
  /**
   * Zwei Properties nachtragen war zuvor ein Fehlschlag: `fragmentFromJson` nimmt nur ein
   * Objekt, und das Modell fiel danach auf Einzelaufrufe zurueck, also genau die Runden,
   * die dieses Werkzeug sparen soll.
   */
  it("teilbaum_einfuegen nimmt auch eine Liste von Geschwistern", () => {
    const { istFehler, wert } = ergebnisVon("teilbaum_einfuegen", {
      elternId: knotenMit("Nameplate"),
      slot: "submodelElements",
      json: JSON.stringify([
        { modelType: "Property", idShort: "StateCounty", valueType: "xs:string", value: "NRW" },
        { modelType: "Property", idShort: "NationalCode", valueType: "xs:string", value: "DE" },
      ]),
    });
    expect(istFehler).toBe(false);
    expect((wert["eingefuegt"] as unknown[]).length).toBe(2);
    expect(knotenMit("StateCounty")).toBeTruthy();
    expect(knotenMit("NationalCode")).toBeTruthy();
  });

  it("meldet eine abgelehnte Aenderung als Fehlschlag, obwohl der Store still bleibt", () => {
    const wurzel = useEditor.getState().model?.rootId as string;
    const { istFehler, anzeige } = ergebnisVon("element_loeschen", { nodeId: wurzel });
    expect(istFehler).toBe(true);
    expect(anzeige).toContain("nicht loeschen");
    expect(useEditor.getState().model?.nodes[wurzel]).toBeDefined();
  });

  it("meldet ein abgelehntes Verschieben, statt Erfolg zu behaupten", () => {
    const eltern = knotenMit("Nameplate");
    const kind = knotenMit("Hersteller");
    const { istFehler } = ergebnisVon("element_verschieben", {
      nodeId: eltern,
      zielId: kind,
      slot: "value",
      index: null,
    });
    expect(istFehler).toBe(true);
    expect(useEditor.getState().model?.nodes[eltern]?.parent).not.toBe(kind);
  });

  it("weist eine unbekannte nodeId ab", () => {
    expect(ergebnisVon("element_lesen", { nodeId: "n999" }).istFehler).toBe(true);
  });

  it("weist ein unbekanntes Werkzeug ab", () => {
    expect(ergebnisVon("gibt_es_nicht").istFehler).toBe(true);
  });
});
