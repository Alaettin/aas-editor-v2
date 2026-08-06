import { expect, test } from "@playwright/test";

/**
 * Die Auffangstelle der Routen.
 *
 * Nachgestellt wird der Fall, der nach einem Deployment der Normalfall ist: der Browser
 * haelt eine alte `index.html` mit alten Chunk-Namen, und die gibt es auf dem Server nicht
 * mehr. Bis zum 06.08.2026 ergab das eine weisse Seite ohne Weg zurueck.
 */
test.describe("Fehlerseite", () => {
  test("faengt ein fehlgeschlagenes Nachladen auf, statt weiss zu bleiben", async ({ page }) => {
    // Der Chunk der Projektliste wird abgefangen. Im Entwicklungsbetrieb heisst er nach
    // seiner Quelldatei, im Bau traegt er einen Hash: beides deckt dasselbe Muster ab.
    await page.route(/ProjectsRoute/, (route) => route.fulfill({ status: 404, body: "" }));

    await page.goto("/projekte");

    await expect(page.getByRole("heading", { name: /ließ sich nicht laden/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Neu laden" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Zur Projektliste" })).toBeVisible();

    // Und der Weg heraus fuehrt tatsaechlich zurueck, sobald der Chunk wieder da ist.
    await page.unroute(/ProjectsRoute/);
    await page.getByRole("button", { name: "Neu laden" }).click();
    await expect(page.getByRole("button", { name: "Neues Projekt" }).first()).toBeVisible();
  });
});
