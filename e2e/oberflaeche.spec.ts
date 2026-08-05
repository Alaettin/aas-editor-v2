import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

/**
 * Die Oberflaeche im Browser, Phase 8.
 *
 * Gepruefte Zusagen: der Rahmen haelt seine Hoehen, jede Sicht laesst sich ohne
 * Konsolenfehler oeffnen, beide Erscheinungen tragen, die Einrueckung im Baum entspricht
 * der Tiefe, und der Assistent sagt ohne Anbindung, dass er nichts kann.
 */

const ENV = Object.fromEntries(
  readFileSync(fileURLToPath(new URL("../.env", import.meta.url)), "utf8")
    .split(/\r?\n/)
    .filter((zeile) => zeile.includes("=") && !zeile.startsWith("#"))
    .map((zeile) => [
      zeile.slice(0, zeile.indexOf("=")).trim(),
      zeile.slice(zeile.indexOf("=") + 1).trim(),
    ]),
);

const PROBE = fileURLToPath(new URL("./probe.json", import.meta.url));

async function anmeldenUndOeffnen(page: Page, name: string): Promise<void> {
  await page.goto("/projekte");
  await page.waitForURL("**/login");
  await page.fill("#benutzer", ENV["AUTH_USERNAME"] ?? "");
  await page.fill("#passwort", ENV["AUTH_PASSWORD"] ?? "");
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => location.pathname === "/projekte");

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

interface KnownStore {
  getState: () => {
    status: string;
    model: { nodes: Record<string, { data: Record<string, unknown>; nodeId: string }> };
    setView: (view: string) => void;
    setTheme: (theme: string) => void;
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
          (window as never as { __aasEditorStore: KnownStore }).__aasEditorStore
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
