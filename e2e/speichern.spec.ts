import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

/**
 * Der Speichern-Knopf und der orange Punkt in der Fusszeile beantworten dieselbe Frage.
 * Bis zum 06.08.2026 taten sie es nicht: eine im Editor geoeffnete Datei riss den
 * Projektbezug ab, die Fusszeile meldete Ungespeichertes und der Knopf war tot.
 */

const PROBE = fileURLToPath(new URL("./probe.json", import.meta.url));

async function anmeldenUndOeffnen(page: Page, name: string): Promise<void> {
  await page.goto("/projekte");
  await page.getByRole("button", { name: "Neues Projekt" }).first().waitFor();
  await page.getByRole("button", { name: "Neues Projekt" }).first().click();
  await page.fill("#projektname", name);
  await page.setInputFiles('input[type="file"]', PROBE);
  await page.getByRole("button", { name: "Anlegen" }).click();
  await page.waitForFunction(() => /\/editor\/[0-9a-f-]{36}/.test(location.pathname), null, {
    timeout: 30000,
  });
}

test.describe("Speichern", () => {
  test("laesst sich klicken, sobald die Fusszeile Ungespeichertes meldet", async ({ page }) => {
    await anmeldenUndOeffnen(page, `Speichern ${String(Date.now())}`);

    const knopf = page.getByRole("button", { name: /Gespeichert|Speichern/ }).first();
    const punkt = page.locator('footer [aria-label="ungespeichert"]');

    // Frisch angelegt: nichts steht aus, also weder Punkt noch klickbarer Knopf.
    await expect(punkt).toHaveCount(0);
    await expect(knopf).toBeDisabled();

    // Eine Vorlage in dasselbe Projekt laden. Danach steht etwas aus.
    await page.setInputFiles('input[type="file"]', PROBE);
    await expect(punkt).toHaveCount(1);
    await expect(knopf).toBeEnabled();

    await knopf.click();
    await expect(page.getByText("Projekt gespeichert.")).toBeVisible({ timeout: 15000 });
    await expect(punkt).toHaveCount(0);
    await expect(knopf).toBeDisabled();
  });
});
