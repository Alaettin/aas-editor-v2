import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

/**
 * Die Oberflaeche im Browser, Phase 8.
 *
 * Gepruefte Zusagen: der Rahmen haelt seine Hoehen, der Editor oeffnet ohne
 * Konsolenfehler, die Einrueckung im Baum entspricht der Tiefe, und der Assistent
 * sagt ohne Anbindung, dass er nichts kann.
 */

const PROBE = fileURLToPath(new URL("./probe.json", import.meta.url));

async function anmeldenUndOeffnen(page: Page, name: string): Promise<void> {
  // Die Sitzung kommt aus `anmeldung.setup.ts`, siehe playwright.config.ts.
  await page.goto("/projekte");
  await page.getByRole("button", { name: "Neues Projekt" }).first().waitFor();

  await page.getByRole("button", { name: "Neues Projekt" }).first().click();
  await page.fill("#projektname", name);
  await page.setInputFiles('input[type="file"]', PROBE);
  await page.getByRole("button", { name: "Anlegen" }).click();
  await page.waitForFunction(() => /\/editor\/[0-9a-f-]{36}/.test(location.pathname), null, {
    timeout: 30000,
  });
  await page.waitForFunction(
    () =>
      (window as never as { __aasEditorStore?: KnownStore }).__aasEditorStore?.getState().status ===
      "bereit",
    null,
    { timeout: 30000 },
  );
}

interface AnsichtStore {
  getState: () => {
    setLanguage: (language: string) => void;
  };
}

interface KnownStore {
  getState: () => {
    status: string;
    model: { nodes: Record<string, { data: Record<string, unknown>; nodeId: string }> };
    goToNode: (nodeId: string) => void;
  };
}

test.describe("Oberflaeche", () => {
  test("Rahmen haelt seine Hoehen und laeuft nicht ueber", async ({ page }) => {
    await anmeldenUndOeffnen(page, `Rahmen ${String(Date.now())}`);

    const hoehe = async (auswahl: string) =>
      (await page.locator(auswahl).first().boundingBox())?.height ?? 0;

    expect(await hoehe("header, div:has(> .font-display)")).toBeGreaterThan(0);
    expect(await hoehe("footer")).toBeCloseTo(32, 0);

    const ueberlauf = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(ueberlauf).toBe(false);
  });

  test("der Editor oeffnet ohne Konsolenfehler", async ({ page }) => {
    const fehler: string[] = [];
    page.on("pageerror", (e) => fehler.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && !m.text().includes("Failed to load resource")) {
        fehler.push(m.text());
      }
    });

    await anmeldenUndOeffnen(page, `Oeffnen ${String(Date.now())}`);

    // Seit dem 10.08.2026 gibt es nur noch das Formular, der Graph ist entfallen.
    await expect(page.getByRole("tree")).toBeVisible();

    expect(fehler).toEqual([]);
  });

  test("die Einrueckung im Baum entspricht der Tiefe", async ({ page }) => {
    await anmeldenUndOeffnen(page, `Baum ${String(Date.now())}`);

    const einrueckung = await page.evaluate(() =>
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--tree-indent"),
      ),
    );

    const zeilen = page.locator('[role="treeitem"]');
    const anzahl = Math.min(await zeilen.count(), 6);
    for (let i = 0; i < anzahl; i += 1) {
      const zeile = zeilen.nth(i);
      const tiefe = Number(await zeile.getAttribute("aria-level")) - 1;
      const breite = (await zeile.locator("[data-tree-guides]").boundingBox())?.width ?? -1;
      expect(breite).toBeCloseTo(tiefe * einrueckung, 0);
    }
  });

  /**
   * Ohne hinterlegten Schluessel bleibt der Assistent stumm und sagt das auch. Die
   * Testumgebung hat keinen, das ist hier also der reale Zustand und nicht gestellt.
   */
  test("der Assistent sagt, dass kein Schluessel hinterlegt ist", async ({ page }) => {
    await anmeldenUndOeffnen(page, `Assistent ${String(Date.now())}`);

    const vorher = (await page.locator("main").boundingBox())?.width ?? 0;
    await page.keyboard.press("Control+j");

    const panel = page.locator("[data-assistant]");
    await expect(panel).toBeVisible();
    await expect(panel.locator("[data-assistant-status]")).toHaveText("Nicht verbunden");
    await expect(panel.locator("textarea")).toBeDisabled();

    const nachher = (await page.locator("main").boundingBox())?.width ?? 0;
    // Verdraengen statt ueberlagern: die Sicht muss wirklich schmaler geworden sein.
    expect(nachher).toBeLessThan(vorher);
  });

  /**
   * Und mit Schluessel arbeitet er wirklich am Modell. Der Anbieter wird abgefangen: der
   * Lauf soll die Schleife und die Werkzeuge pruefen, nicht das Netz und nicht die Rechnung.
   */
  test("der Assistent legt ueber ein Werkzeug ein Element an", async ({ page }) => {
    await page.route("**/api/einstellungen/assistent", async (route) => {
      await route.fulfill({
        json: {
          gesetzt: true,
          endung: "abcd",
          modell: "gpt-5.6-sol",
          modelle: [{ id: "gpt-5.6-sol", eingabe: 5, ausgabe: 30 }],
        },
      });
    });

    // Erste Runde: ein Werkzeugaufruf. Zweite Runde: die Antwort dazu.
    let runde = 0;
    await page.route("**/api/assistent/nachricht", async (route) => {
      runde += 1;
      const ereignisse =
        runde === 1
          ? [
              {
                art: "fertig",
                ausgabe: [
                  {
                    type: "function_call",
                    call_id: "call_1",
                    name: "teilbaum_einfuegen",
                    // Die Wurzel ist per Zusage des Kerns immer n0; jede andere nodeId
                    // haenge davon ab, was in probe.json steht.
                    arguments: JSON.stringify({
                      elternId: "n0",
                      slot: "submodels",
                      json: JSON.stringify({
                        modelType: "Submodel",
                        id: "https://example.com/sm/e2e",
                        idShort: "Technikdaten",
                        submodelElements: [
                          {
                            modelType: "Property",
                            idShort: "Leistung",
                            valueType: "xs:string",
                            value: "5 kW",
                          },
                        ],
                      }),
                    }),
                  },
                ],
                verbrauch: { input_tokens: 10, output_tokens: 5 },
              },
            ]
          : [
              { art: "text", text: "Technikdaten angelegt." },
              { art: "fertig", ausgabe: [], verbrauch: { input_tokens: 12, output_tokens: 4 } },
            ];

      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: ereignisse.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""),
      });
    });

    await anmeldenUndOeffnen(page, `Assistent Werkzeug ${String(Date.now())}`);
    await page.keyboard.press("Control+j");

    const panel = page.locator("[data-assistant]");
    await expect(panel.locator("[data-assistant-status]")).toHaveText("gpt-5.6-sol");

    await panel.locator("textarea").fill("Lege ein Teilmodell Technikdaten an");
    await panel.locator("textarea").press("Enter");

    // Die Werkzeugzeile im Verlauf, der Antworttext und der Knoten im Baum.
    await expect(panel.getByText("Technikdaten angelegt.")).toBeVisible();

    // Nach dem Lauf klappt die Schrittgruppe zu, der Zaehler bleibt.
    await expect(panel.getByText("1 Schritt", { exact: true })).toBeVisible();
    await expect(panel.getByText("Technikdaten eingefuegt")).toBeHidden();

    // Aufgeklappt nennt die Zeile den Namen, nicht die Klasse: "Technikdaten", nicht "Submodel".
    await panel.getByText("1 Schritt", { exact: true }).click();
    await expect(panel.getByText("Technikdaten eingefuegt")).toBeVisible();

    // Und der Knoten steht wirklich im Modell. Ueber den Filter statt ueber die Sichtbarkeit
    // im Baum: ein freies Teilmodell liegt in einem Ordner, der zugeklappt sein darf.
    await page.getByRole("textbox", { name: "Filter" }).fill("Technikdaten");
    await expect(page.getByRole("treeitem", { name: /Technikdaten/ })).toBeVisible();
  });

  /**
   * Ein Fehlschlag darf sich nicht hinter dem Zaehler verstecken: das ist genau der Fall,
   * in dem der Nutzer nachsehen muesste. Das Loeschen der Wurzel lehnt der Kern ab.
   */
  test("ein gescheiterter Schritt bleibt ohne Aufklappen sichtbar", async ({ page }) => {
    await page.route("**/api/einstellungen/assistent", async (route) => {
      await route.fulfill({
        json: {
          gesetzt: true,
          endung: "abcd",
          modell: "gpt-5.6-sol",
          modelle: [{ id: "gpt-5.6-sol", eingabe: 5, ausgabe: 30 }],
        },
      });
    });

    let runde = 0;
    await page.route("**/api/assistent/nachricht", async (route) => {
      runde += 1;
      const ereignisse =
        runde === 1
          ? [
              {
                art: "fertig",
                ausgabe: [
                  {
                    type: "function_call",
                    call_id: "call_1",
                    name: "element_loeschen",
                    arguments: JSON.stringify({ nodeId: "n0" }),
                  },
                ],
                verbrauch: { input_tokens: 8, output_tokens: 3 },
              },
            ]
          : [
              { art: "text", text: "Das geht nicht." },
              { art: "fertig", ausgabe: [], verbrauch: { input_tokens: 9, output_tokens: 4 } },
            ];

      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: ereignisse.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""),
      });
    });

    await anmeldenUndOeffnen(page, `Assistent Fehler ${String(Date.now())}`);
    await page.keyboard.press("Control+j");

    const panel = page.locator("[data-assistant]");
    await panel.locator("textarea").fill("Loesche alles");
    await panel.locator("textarea").press("Enter");

    await expect(panel.getByText("Das geht nicht.")).toBeVisible();
    // Ohne einen Klick auf den Zaehler.
    await expect(panel.getByText(/nicht loeschen/)).toBeVisible();
  });

  /**
   * Das Modell wechselt man im Kopf des Assistenten, nicht in den Einstellungen: die
   * Entscheidung faellt waehrend des Gespraechs.
   */
  test("der Modellwechsel sitzt im Kopf des Assistenten", async ({ page }) => {
    let modell = "gpt-5.6-sol";
    await page.route("**/api/einstellungen/assistent", async (route) => {
      if (route.request().method() === "PUT") {
        modell = (route.request().postDataJSON() as { modell: string }).modell;
      }
      await route.fulfill({
        json: {
          gesetzt: true,
          endung: "abcd",
          modell,
          modelle: [
            { id: "gpt-5.6-sol", eingabe: 5, ausgabe: 30 },
            { id: "gpt-5.6-luna", eingabe: 0.2, ausgabe: 1.2 },
          ],
        },
      });
    });

    await anmeldenUndOeffnen(page, `Assistent Modell ${String(Date.now())}`);
    await page.keyboard.press("Control+j");

    const status = page.locator("[data-assistant] [data-assistant-status]");
    await expect(status).toHaveText("gpt-5.6-sol");

    await status.click();
    await page.getByRole("menuitemradio", { name: /gpt-5\.6-luna/ }).click();

    await expect(status).toHaveText("gpt-5.6-luna");
    expect(modell).toBe("gpt-5.6-luna");
  });

  /**
   * Der Schluessel: eintragen, dann steht nur noch eine Zeile mit der Maske da. Aendern
   * klappt das Feld auf, Abbrechen wieder zu. Und das Feld ist dabei leer, weil der
   * Server den Schluessel nicht herausgibt.
   */
  test("der Schluessel steht als Zeile, das Feld kommt erst beim Aendern", async ({ page }) => {
    /*
     * Der Endpunkt wird abgefangen, und zwar aus zwei Gruenden. Er macht den Lauf
     * unabhaengig davon, ob auf dem Entwicklungsserver schon ein Schluessel liegt. Und
     * vor allem: ein Test, der am Ende "Schluessel entfernen" drueckt, hat sonst den
     * echten Schluessel des Entwicklers geloescht.
     */
    let hinterlegt: string | null = null;
    await page.route("**/api/einstellungen/assistent", async (route) => {
      const art = route.request().method();
      if (art === "PUT") {
        const rumpf = route.request().postDataJSON() as { schluessel?: string };
        if (rumpf.schluessel !== undefined) hinterlegt = rumpf.schluessel;
      }
      if (art === "DELETE") hinterlegt = null;

      await route.fulfill({
        json: {
          gesetzt: hinterlegt !== null,
          endung: hinterlegt === null ? null : hinterlegt.slice(-4),
          modell: "gpt-5.6-sol",
          modelle: [{ id: "gpt-5.6-sol", eingabe: 5, ausgabe: 30 }],
        },
      });
    });

    await anmeldenUndOeffnen(page, `Schluessel ${String(Date.now())}`);
    await page.getByRole("button", { name: "Einstellungen" }).click();

    const dialog = page.getByRole("dialog");
    const feld = dialog.getByLabel("OpenAI-Schlüssel");

    // Ohne hinterlegten Schluessel steht das Feld sofort da.
    await expect(feld).toBeVisible();
    await feld.fill("sk-probe-0000000000000000abcd");
    await dialog.getByRole("button", { name: "Sichern" }).click();

    // Danach nur noch die Zeile mit der Maske.
    await expect(dialog.getByText("••••abcd")).toBeVisible();
    await expect(feld).toBeHidden();

    await dialog.getByRole("button", { name: "Ändern" }).click();
    await expect(feld).toBeVisible();
    await expect(feld).toHaveValue("");

    await dialog.getByRole("button", { name: "Abbrechen" }).click();
    await expect(dialog.getByText("••••abcd")).toBeVisible();

    await dialog.getByRole("button", { name: "Schlüssel entfernen" }).click();
    await expect(feld).toBeVisible();
  });

  test("spricht auf Englisch wirklich Englisch", async ({ page }) => {
    // Der eigentliche Pruefstein ist nicht die Anmeldung, sondern der Editor: dort kommen
    // die Saetze aus drei Quellen zusammen, aus de.json, aus dem Kern und vom Server.
    await anmeldenUndOeffnen(page, `Sprache ${String(Date.now())}`);

    await page.evaluate(() =>
      (window as never as { __aasAnsichtStore: AnsichtStore }).__aasAnsichtStore
        .getState()
        .setLanguage("en"),
    );
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    // Drei Quellen auf einmal: die Werkzeugleiste aus de/en.json, die Beschriftung des
    // Baums ueber `aria-label`, und die Sicht-Umschaltung.
    await expect(page.getByRole("button", { name: "Export" })).toBeVisible();
    await expect(page.getByRole("tree", { name: "Structure" })).toBeVisible();
    await expect(page.getByText("Form", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Exportieren" })).toHaveCount(0);
    await expect(page.getByText("Formular", { exact: true })).toHaveCount(0);

    // Kein roher Schluessel im Bild. Genau so faellt ein vergessener Eintrag auf: als
    // "menu.datei" mitten in der Menuezeile.
    const text = await page.locator("body").innerText();
    expect(text, "roher i18n-Schluessel sichtbar").not.toMatch(
      /\b(app|menu|baum|status|befund|graph|inspektor)\.[a-zA-Z]/,
    );

    await page.evaluate(() =>
      (window as never as { __aasAnsichtStore: AnsichtStore }).__aasAnsichtStore
        .getState()
        .setLanguage("de"),
    );
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
  });

  /*
   * Das Kontextmenue haengt am ganzen Baumcontainer, nicht an jeder Zeile: bei zehntausend
   * Zeilen waere alles andere zehntausendfacher Aufwand. Der Preis ist, dass ein
   * Rechtsklick **neben** eine Zeile ohne Zutun kein Ziel hat. Bis zum 10.08.2026 kam
   * dabei zweierlei heraus, und der zweite Fall war der gefaehrlichere.
   *
   * Geprueft wird im Browser und nicht als Unit-Test: Radix, die Treffererkennung im DOM
   * und die Reihenfolge der Ereignisse gibt es nur hier wirklich.
   */
  test.describe("Rechtsklick im Baum", () => {
    /** Die leere Flaeche unter der letzten Zeile, in Fensterkoordinaten. */
    async function leereFlaeche(page: Page): Promise<{ x: number; y: number }> {
      const baum = await page.getByRole("tree").boundingBox();
      const zeilen = await page.getByRole("treeitem").all();
      const letzte = await zeilen[zeilen.length - 1]?.boundingBox();
      if (!baum || !letzte) throw new Error("Baum oder Zeilen nicht gefunden.");

      const y = letzte.y + letzte.height + 40;
      // Waere die Flaeche voll, gaebe es nichts zu pruefen; die Probe ist klein genug.
      expect(y, "der Baum fuellt seine ganze Hoehe, es gibt keine leere Flaeche").toBeLessThan(
        baum.y + baum.height - 10,
      );
      return { x: baum.x + baum.width / 2, y };
    }

    test("zeigt neben einer Zeile das Menue der Wurzel, nicht ein leeres", async ({ page }) => {
      await anmeldenUndOeffnen(page, `Kontext leer ${String(Date.now())}`);

      // Ohne vorherigen Rechtsklick: genau der gemeldete Fall, das Menue war leer.
      const ort = await leereFlaeche(page);
      await page.mouse.click(ort.x, ort.y, { button: "right" });

      /*
       * Ueber die Rolle und nicht ueber den Text: ein Eintrag traegt neben seinem Namen
       * sein Tastenkuerzel, sein Textinhalt lautet also "EinfuegenStrg+V". Ein
       * `getByText(..., { exact: true })` findet ihn deshalb nie, und die Pruefung waere
       * gruen gewesen, ohne je etwas zu treffen.
       */
      const menue = page.getByRole("menu");
      await expect(menue).toBeVisible();
      await expect(menue.getByRole("menuitem", { name: /^Neu/ })).toBeVisible();
      await expect(menue.getByRole("menuitem", { name: /^Einfügen/ })).toBeVisible();
      // Die Wurzel ist kein Element: was sie zerstoeren wuerde, darf nicht dastehen.
      await expect(menue.getByRole("menuitem", { name: /^Löschen/ })).toHaveCount(0);
    });

    test("uebernimmt neben einer Zeile nicht das Menue der zuletzt geklickten", async ({
      page,
    }) => {
      await anmeldenUndOeffnen(page, `Kontext alt ${String(Date.now())}`);

      // Erst eine echte Zeile: die hat Loeschen, und das gehoert auch dorthin. Zugleich
      // die Nagelprobe, dass der Zaun nicht zu weit greift.
      const zeile = page.getByRole("treeitem").nth(1);
      await zeile.click({ button: "right" });
      await expect(
        page.getByRole("menu").getByRole("menuitem", { name: /^Löschen/ }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu")).toHaveCount(0);

      // Jetzt daneben. Bis zum 10.08.2026 stand hier weiter das Menue der Zeile von
      // vorhin, samt Ausschneiden und Loeschen fuer ein Element, das gar nicht unter dem
      // Zeiger lag. Das sah richtig aus und war es nicht.
      const ort = await leereFlaeche(page);
      await page.mouse.click(ort.x, ort.y, { button: "right" });

      const menue = page.getByRole("menu");
      await expect(menue).toBeVisible();
      await expect(menue.getByRole("menuitem", { name: /^Neu/ })).toBeVisible();
      await expect(menue.getByRole("menuitem", { name: /^Löschen/ })).toHaveCount(0);
    });
  });

  test("sagt beim Speichern, dass es geklappt hat", async ({ page }) => {
    // Bis Phase 9 gab es im ganzen Programm keine einzige Erfolgsmeldung. Gespeichert
    // wurde still, und der Nutzer musste der Statusleiste glauben.
    await anmeldenUndOeffnen(page, `Rueckmeldung ${String(Date.now())}`);

    await page.evaluate(() => {
      const zustand = (
        window as never as { __aasEditorStore?: KnownStore }
      ).__aasEditorStore?.getState();
      const knoten = Object.values(zustand?.model.nodes ?? {}).find(
        (n) => typeof n.data["idShort"] === "string",
      );
      if (knoten) zustand?.goToNode(knoten.nodeId);
    });

    const feld = page.locator('[data-field="idShort"]').first();
    await feld.waitFor();
    await feld.fill(`Geaendert${String(Date.now() % 1000)}`);
    await feld.blur();

    await page.keyboard.press("Control+s");
    await expect(page.getByText("Projekt gespeichert.")).toBeVisible({ timeout: 15000 });
  });
});
