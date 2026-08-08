import { expect, test, type Page } from "@playwright/test";

/**
 * Der Einstieg auf der AXON-Flaeche.
 *
 * Geprueft wird, was sich nur im Browser zeigt: dass Suche, Filter und Blaettern wirklich
 * am Server haengen, dass ein vergebener Name auffaellt, bevor abgeschickt wird, dass die
 * Rueckfrage vor dem Loeschen steht, und dass der Export drei Formen anbietet und eine
 * Datei liefert.
 *
 * Die Sitzung kommt aus `anmeldung.setup.ts`, siehe playwright.config.ts.
 */

/** Legt ein leeres Projekt an und bleibt auf dem Einstieg stehen. */
async function anlegen(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Neues Projekt" }).first().click();
  await page.fill("#projektname", name);
  const knopf = page.getByRole("button", { name: "Anlegen", exact: true });
  await expect(knopf).toBeEnabled();
  await knopf.click();
  // Ein leeres Projekt geht in den Editor. Von dort zurueck auf den Einstieg.
  await page.waitForFunction(() => /\/editor\/[0-9a-f-]{36}/.test(location.pathname), null, {
    timeout: 30000,
  });
  await page.goto("/projekte");
  await zeilenBereit(page);
}

async function zeilenBereit(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Neues Projekt" }).first().waitFor();
  await page.locator("[data-projekt]").first().waitFor({ timeout: 15000 });
}

test.describe("Einstieg", () => {
  test("filtert und blaettert am Server, nicht in der geladenen Seite", async ({ page }) => {
    const marke = String(Date.now());
    await page.goto("/projekte");
    await page.getByRole("button", { name: "Neues Projekt" }).first().waitFor();

    for (const teil of ["Alpha", "Beta"]) await anlegen(page, `Filter ${teil} ${marke}`);

    // Die Suche laeuft entprellt und geht an den Server: der Bereich unten muss sich
    // mitbewegen, nicht nur die Zeilenzahl.
    await page.getByRole("searchbox").fill(`Filter Alpha ${marke}`);
    await expect(page.locator("[data-projekt]")).toHaveCount(1, { timeout: 10000 });
    await expect(page.getByText(/1–1 von 1|1–1 of 1/)).toBeVisible();

    // Die Marke steht am Ende beider Namen, nicht am Anfang: gesucht wird nach ihr allein.
    // Der Zeitraumfilter ist am 08.08.2026 mit der linken Leiste entfallen, die Suche ist
    // der einzige Filter geblieben.
    await page.getByRole("searchbox").fill(marke);
    await expect(page.locator("[data-projekt]")).toHaveCount(2, { timeout: 10000 });
    await expect(page.getByText(/1–2 von 2|1–2 of 2/)).toBeVisible({ timeout: 10000 });

    await page.getByRole("searchbox").fill("");
    await expect(page.getByText(/1–\d+ von|1–\d+ of/)).toBeVisible({ timeout: 10000 });
  });

  test("springt ueber die Doppelpfeile auf die erste und letzte Seite", async ({ page }) => {
    await page.goto("/projekte");
    await zeilenBereit(page);

    const seiten = await page.getByRole("button", { name: /Seite \d+|Page \d+/ }).count();
    // Bei nur einer Seite gibt es nichts zu springen; die Bestandsdaten der Abnahme
    // liefern reichlich Projekte, aber verlassen wollen wir uns nicht darauf.
    test.skip(seiten < 2, "Nur eine Seite vorhanden.");

    await page.getByRole("button", { name: "Letzte Seite" }).click();
    await expect(page.getByRole("button", { name: "Letzte Seite" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Erste Seite" })).toBeEnabled();

    await page.getByRole("button", { name: "Erste Seite" }).click();
    await expect(page.getByRole("button", { name: "Erste Seite" })).toBeDisabled();
  });

  /**
   * Der Umschalter sitzt seit dem 08.08.2026 in der Titelzeile, auf dem Einstieg wie im
   * Editor. Er zeigt die **geltende** Sprache und nennt im Namen die Zielsprache.
   */
  test("stellt die Sprache ueber die Titelzeile um", async ({ page }) => {
    await page.goto("/projekte");
    await zeilenBereit(page);

    const knopf = page.getByRole("button", { name: /English|Deutsch/ });
    // Der Knopf traegt das Kuerzel der geltenden Sprache, nicht beide nebeneinander.
    await expect(knopf).toHaveText("DE");

    await knopf.click();
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
    await expect(page.getByRole("button", { name: /English|Deutsch/ })).toHaveText("EN");

    // Zurueckstellen, sonst laufen die uebrigen Pruefungen auf Englisch: die Sprache
    // ueberdauert das Neuladen.
    await page.getByRole("button", { name: /English|Deutsch/ }).click();
    await expect(page.getByRole("heading", { name: "Projekte" })).toBeVisible();
  });

  test("laesst einen vergebenen Namen nicht durch", async ({ page }) => {
    const name = `Einmalig ${String(Date.now())}`;
    await page.goto("/projekte");
    await page.getByRole("button", { name: "Neues Projekt" }).first().waitFor();
    await anlegen(page, name);

    await page.getByRole("button", { name: "Neues Projekt" }).first().click();
    await page.fill("#projektname", name);

    // Der Hinweis steht am Feld, nicht nur in einer Meldung, die weggleitet.
    await expect(page.getByRole("alert")).toContainText(/vergeben|taken/, { timeout: 10000 });
    await expect(page.getByRole("button", { name: "Anlegen", exact: true })).toBeDisabled();
  });

  test("fragt vor dem Loeschen zurueck", async ({ page }) => {
    const name = `Wegwerf ${String(Date.now())}`;
    await page.goto("/projekte");
    await page.getByRole("button", { name: "Neues Projekt" }).first().waitFor();
    await anlegen(page, name);

    await page.getByRole("searchbox").fill(name);
    await expect(page.locator("[data-projekt]")).toHaveCount(1, { timeout: 10000 });
    await page.locator("[data-projekt]").first().click();

    await page.getByRole("button", { name: "Löschen" }).click();
    // Rollenbasiert waehlen: `text=Löschen` traefe auch den Fliesstext der Rueckfrage.
    const rueckfrage = page.getByRole("alertdialog");
    await expect(rueckfrage).toBeVisible();
    await expect(rueckfrage).toContainText(name);

    await rueckfrage.getByRole("button", { name: "Löschen" }).click();
    await expect(rueckfrage).toBeHidden({ timeout: 15000 });
    await expect(page.locator("[data-projekt]")).toHaveCount(0);
  });

  test("bietet drei Formen an und liefert eine Datei", async ({ page }) => {
    const name = `Ausfuhr ${String(Date.now())}`;
    await page.goto("/projekte");
    await page.getByRole("button", { name: "Neues Projekt" }).first().waitFor();
    await anlegen(page, name);

    await page.getByRole("searchbox").fill(name);
    await expect(page.locator("[data-projekt]")).toHaveCount(1, { timeout: 10000 });
    await page.locator("[data-projekt]").first().click();

    await page.getByRole("button", { name: "Exportieren" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("radio")).toHaveCount(3);

    await dialog.getByRole("radio", { name: /XML/ }).click();
    const ladung = page.waitForEvent("download", { timeout: 30000 });
    await dialog.getByRole("button", { name: "Exportieren" }).click();
    const datei = await ladung;
    expect(datei.suggestedFilename()).toBe(`${name}.xml`);
  });

  test("traegt keine Hintergrundanimation, ohne Konsolenfehler", async ({ page }) => {
    // Das Datenband ist am 08.08. aus Einstieg und Editor entfernt worden. Der Einstieg
    // zeigt nur noch den Verlauf, also darf hier kein Canvas mehr stehen.
    const fehler: string[] = [];
    page.on("pageerror", (e) => fehler.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && !m.text().includes("Failed to load resource")) {
        fehler.push(m.text());
      }
    });

    await page.goto("/projekte");
    await page.getByRole("button", { name: "Neues Projekt" }).first().waitFor();

    await expect(page.locator("canvas")).toHaveCount(0);
    expect(fehler).toEqual([]);
  });
});
