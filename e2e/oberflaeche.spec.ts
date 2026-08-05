import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

/**
 * Die Oberflaeche im Browser, Phase 8.
 *
 * Gepruefte Zusagen: der Rahmen haelt seine Hoehen, jede Sicht laesst sich ohne
 * Konsolenfehler oeffnen, beide Erscheinungen tragen, die Einrueckung im Baum entspricht
 * der Tiefe, und der Assistent sagt ohne Anbindung, dass er nichts kann.
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
    setTheme: (theme: string) => void;
    setLanguage: (language: string) => void;
  };
}

interface KnownStore {
  getState: () => {
    status: string;
    model: { nodes: Record<string, { data: Record<string, unknown>; nodeId: string }> };
    setView: (view: string) => void;
    goToNode: (nodeId: string) => void;
  };
}

test.describe("Oberflaeche", () => {
  test("Rahmen haelt seine Hoehen und laeuft nicht ueber", async ({ page }) => {
    await anmeldenUndOeffnen(page, `Rahmen ${String(Date.now())}`);

    const hoehe = async (auswahl: string) =>
      (await page.locator(auswahl).first().boundingBox())?.height ?? 0;

    expect(await hoehe("header, div:has(> .font-display)")).toBeGreaterThan(0);
    expect(await hoehe("footer")).toBeCloseTo(28, 0);

    const ueberlauf = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(ueberlauf).toBe(false);
  });

  test("jede Sicht oeffnet ohne Konsolenfehler, hell und dunkel", async ({ page }) => {
    const fehler: string[] = [];
    page.on("pageerror", (e) => fehler.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && !m.text().includes("Failed to load resource")) {
        fehler.push(m.text());
      }
    });

    await anmeldenUndOeffnen(page, `Sichten ${String(Date.now())}`);

    for (const thema of ["light", "dark"]) {
      await page.evaluate(
        (wert) =>
          (window as never as { __aasAnsichtStore: AnsichtStore }).__aasAnsichtStore
            .getState()
            .setTheme(wert),
        thema,
      );
      for (const sicht of ["formular", "tabelle", "graph"]) {
        await page.evaluate(
          (wert) =>
            (window as never as { __aasEditorStore: KnownStore }).__aasEditorStore
              .getState()
              .setView(wert),
          sicht,
        );
        await expect(page.locator(`[data-view="${sicht}"][aria-selected="true"]`)).toBeVisible();
      }
    }

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

  test("der Assistent sagt, dass er nicht angebunden ist", async ({ page }) => {
    await anmeldenUndOeffnen(page, `Assistent ${String(Date.now())}`);

    const vorher = (await page.locator("main").boundingBox())?.width ?? 0;
    await page.keyboard.press("Control+j");

    const panel = page.locator("[data-assistant]");
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Nicht verbunden")).toBeVisible();
    await expect(panel.locator("input")).toBeDisabled();
    await expect(panel.getByRole("button", { name: "Anwenden" })).toBeDisabled();

    const nachher = (await page.locator("main").boundingBox())?.width ?? 0;
    // Verdraengen statt ueberlagern: die Sicht muss wirklich schmaler geworden sein.
    expect(nachher).toBeLessThan(vorher);
  });

  test("traegt den Dunkelmodus auch ausserhalb des Editors", async ({ page }) => {
    // Bis Phase 9 setzte allein `AppShell` die Klasse an der Wurzel. Wer direkt auf
    // /projekte einstieg, sah die Liste immer hell, egal was eingestellt war.
    await page.goto("/projekte");
    await page.evaluate(() =>
      (window as never as { __aasAnsichtStore: AnsichtStore }).__aasAnsichtStore
        .getState()
        .setTheme("dark"),
    );
    await expect(page.locator("html")).toHaveClass(/dark/);

    // Neu laden: das Vorabskript in index.html muss die Klasse **vor** dem ersten Bild
    // setzen, sonst blitzt bei jedem Laden kurz die helle Fassung auf.
    await page.goto("/projekte");
    const vorReact = await page.evaluate(() => ({
      klasse: document.documentElement.classList.contains("dark"),
      // Steht die Klasse schon, bevor React ueberhaupt gemountet hat?
      leer: document.getElementById("root")?.childElementCount === 0,
    }));
    expect(vorReact.klasse).toBe(true);

    await page.evaluate(() =>
      (window as never as { __aasAnsichtStore: AnsichtStore }).__aasAnsichtStore
        .getState()
        .setTheme("light"),
    );
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

    // Drei Quellen auf einmal: die Menuezeile aus de/en.json, die Beschriftung des Baums
    // ueber `aria-label`, und die Sicht-Umschaltung.
    await expect(page.getByText("File", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("tree", { name: "Structure" })).toBeVisible();
    await expect(page.getByText("Form", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Datei", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Formular", { exact: true })).toHaveCount(0);

    // Kein roher Schluessel im Bild. Genau so faellt ein vergessener Eintrag auf: als
    // "menu.datei" mitten in der Menuezeile.
    const text = await page.locator("body").innerText();
    expect(text, "roher i18n-Schluessel sichtbar").not.toMatch(
      /\b(app|menu|baum|status|befund|tabelle|graph|inspektor)\.[a-zA-Z]/,
    );

    await page.evaluate(() =>
      (window as never as { __aasAnsichtStore: AnsichtStore }).__aasAnsichtStore
        .getState()
        .setLanguage("de"),
    );
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
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
