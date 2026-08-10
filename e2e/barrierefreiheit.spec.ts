import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Barrierefreiheit, mechanisch geprueft.
 *
 * axe findet nicht alles, aber es findet genau die Sorte Fehler, die beim Bauen entsteht
 * und beim Ansehen nicht auffaellt: ein Bedienelement ohne Namen, eine Rolle mit dem
 * falschen Kind, ein Kontrast unter der Grenze. Gepruefte Stufen sind "serious" und
 * "critical"; alles darunter waere Geschmacksfrage und wuerde den Lauf zur Klingel machen.
 *
 * Seit dem 06.08.2026 gibt es nur noch eine Erscheinung, dafuer ist die ganze Flaeche neu
 * eingefaerbt. Kontrast ist genau die Sorte Fehler, die beim Ansehen nicht auffaellt.
 */

const PROBE = fileURLToPath(new URL("./probe.json", import.meta.url));

interface KnownStore {
  getState: () => {
    status: string;
  };
}

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

/** Die Verstoesse, die zaehlen, als lesbare Liste. */
async function verstoesse(page: Page): Promise<string[]> {
  const ergebnis = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  // Mit Ziel und Begruendung je Fundstelle: eine blosse Regelkennung sagt niemandem,
  // welches Element gemeint ist, und der naechste Lauf faengt wieder von vorn an.
  return ergebnis.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .flatMap((v) =>
      v.nodes.map(
        (n) =>
          `${v.id}: ${n.target.join(" ")} | ` +
          `${(n.any[0]?.message ?? v.help).replace(/\s+/g, " ").slice(0, 160)}`,
      ),
    );
}

test.describe("Barrierefreiheit", () => {
  test("Anmeldung", async ({ page }) => {
    await page.goto("/login");
    await page.locator("form").waitFor();
    expect(await verstoesse(page)).toEqual([]);
  });

  test("Projektliste", async ({ page }) => {
    await page.goto("/projekte");
    await page.getByRole("heading").first().waitFor();
    expect(await verstoesse(page)).toEqual([]);
  });

  test("Editor im Formular", async ({ page }) => {
    await anmeldenUndOeffnen(page, `Barrierefrei ${String(Date.now())}`);

    await expect(page.getByRole("tree")).toBeVisible();
    // Die Farbuebergaenge ausklingen lassen. Sonst misst axe eine Zwischenfarbe und
    // meldet einen Kontrast, den es in keinem Ruhezustand gibt.
    await page.waitForTimeout(500);

    expect(await verstoesse(page)).toEqual([]);
  });
});
