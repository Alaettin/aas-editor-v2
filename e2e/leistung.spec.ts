import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

/**
 * Die Zahlen aus Plan Abschnitt 10, im Browser gemessen.
 *
 * Was `apps/web/test/leistung.test.ts` nicht kann: Rahmenzeiten, Bildaufbau und der Weg
 * vom Tastendruck bis zum gezeichneten Zeichen. Genau die drei Zusagen stehen hier.
 *
 * Voraussetzung ist das grosse Modell aus `pnpm modell`. Fehlt es, ueberspringt sich die
 * Datei, statt rot zu werden.
 */

const MODELL = fileURLToPath(new URL("../test-data/gross/modell-10000.json", import.meta.url));

interface KnownStore {
  getState: () => {
    status: string;
    model: { nodes: Record<string, { kind: string; nodeId: string }> } | null;
    goToNode: (nodeId: string) => void;
    expandAll: (offen: boolean) => void;
  };
}

/** Meldet sich an und legt ein Projekt mit dem grossen Modell an. */
async function grossesProjekt(page: Page, name: string): Promise<void> {
  // Die Sitzung kommt aus `anmeldung.setup.ts`, siehe playwright.config.ts.
  await page.goto("/projekte");
  await page.getByRole("button", { name: "Neues Projekt" }).first().waitFor();

  await page.getByRole("button", { name: "Neues Projekt" }).first().click();
  await page.fill("#projektname", name);
  await page.setInputFiles('input[type="file"]', MODELL);
  await page.getByRole("button", { name: "Anlegen" }).click();
  await page.waitForFunction(() => /\/editor\/[0-9a-f-]{36}/.test(location.pathname), null, {
    timeout: 120000,
  });
  await page.waitForFunction(
    () =>
      (window as never as { __aasEditorStore?: KnownStore }).__aasEditorStore?.getState().status ===
      "bereit",
    null,
    { timeout: 120000 },
  );
}

function perzentil(werte: readonly number[], anteil: number): number {
  const sortiert = [...werte].sort((a, b) => a - b);
  return sortiert[Math.min(sortiert.length - 1, Math.floor(sortiert.length * anteil))] ?? 0;
}

test.describe("Leistung", () => {
  // Ein Modell dieser Groesse anzulegen dauert, und genau das soll gemessen werden duerfen,
  // ohne dass die Uhr der Pruefung vorher ablaeuft.
  test.setTimeout(300000);
  test.skip(!existsSync(MODELL), "Kein grosses Modell vorhanden, `pnpm modell` ausfuehren.");

  test("baut das erste Bild schnell auf", async ({ page }) => {
    await page.goto("/login");
    await page.locator("form").waitFor();

    /*
     * Auf den Eintrag warten, statt ihn einmal abzufragen. Im DOM zu stehen heisst noch
     * nicht, gemalt zu sein: seit die Anmeldung ohne Canvas auskommt, ist das Formular so
     * frueh da, dass die Messung sonst regelmaessig vor dem ersten Bild liegt und -1
     * liest.
     */
    const lies = () =>
      page.evaluate(
        () => performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? -1,
      );
    await expect.poll(lies, { timeout: 10000 }).toBeGreaterThan(0);

    const fcp = await lies();
    console.log(`  erster Bildaufbau: ${fcp.toFixed(0)} ms`);
    expect(fcp).toBeLessThan(1500);
  });

  test("laesst sich bei zehntausend Elementen ohne Verzug tippen", async ({ page }) => {
    await grossesProjekt(page, `Leistung Tippen ${String(Date.now())}`);

    // Eine MultiLanguageProperty auswaehlen: dort steht das Feld, das frueher bei jedem
    // Zeichen den ganzen Aenderungsweg ausgeloest hat.
    const gewaehlt = await page.evaluate(() => {
      const zustand = (
        window as never as { __aasEditorStore?: KnownStore }
      ).__aasEditorStore?.getState();
      const knoten = Object.values(zustand?.model?.nodes ?? {}).find(
        (n) => n.kind === "MultiLanguageProperty",
      );
      if (!knoten) return false;
      zustand?.goToNode(knoten.nodeId);
      return true;
    });
    expect(gewaehlt).toBe(true);

    const feld = page.getByLabel("Text", { exact: true }).first();
    await feld.waitFor();
    await feld.click();

    const messung = await page.evaluate(async () => {
      const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
      if (!el) return null;
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
      const setzen = Object.getOwnPropertyDescriptor(proto.prototype, "value")?.set;
      if (!setzen) return null;

      const synchron: number[] = [];
      const bisBild: number[] = [];

      for (let i = 0; i < 30; i += 1) {
        const start = performance.now();
        // React haengt an den nativen Setter, deshalb der Umweg ueber das Prototyp-Setter.
        // Ein `input`-Ereignis ist diskret, React arbeitet es synchron ab.
        setzen.call(el, `${el.value}x`);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        synchron.push(performance.now() - start);

        await new Promise<void>((fertig) => {
          requestAnimationFrame(() => setTimeout(() => fertig(), 0));
        });
        bisBild.push(performance.now() - start);
      }

      return { synchron, bisBild };
    });

    expect(messung).not.toBeNull();
    const synchron = perzentil(messung!.synchron, 0.95);
    const bisBild = perzentil(messung!.bisBild, 0.95);
    console.log(`  Tastendruck, blockierend: ${synchron.toFixed(1)} ms (95. Perzentil)`);
    console.log(`  Tastendruck, bis zum Bild: ${bisBild.toFixed(1)} ms (95. Perzentil)`);

    // Die Zusage aus Abschnitt 10: das Zeichen steht in unter 50 ms.
    expect(bisBild).toBeLessThan(50);
  });

  test("rollt den Baum bei zehntausend Zeilen ohne sichtbares Stocken", async ({ page }) => {
    await grossesProjekt(page, `Leistung Rollen ${String(Date.now())}`);

    await page.evaluate(() => {
      (window as never as { __aasEditorStore?: KnownStore }).__aasEditorStore
        ?.getState()
        .expandAll(true);
    });
    // Erst wenn wirklich zehntausend Zeilen im Baum stehen, misst das hier etwas.
    await page.waitForFunction(() => {
      const baum = document.querySelector('[role="tree"]');
      return baum !== null && baum.scrollHeight > 100000;
    });

    const rahmen = await page.evaluate(async () => {
      const baum = document.querySelector('[role="tree"]');
      if (!baum) return null;

      const abstaende: number[] = [];
      let vorher = performance.now();
      let laeuft = true;
      const takt = (jetzt: number) => {
        abstaende.push(jetzt - vorher);
        vorher = jetzt;
        if (laeuft) requestAnimationFrame(takt);
      };
      requestAnimationFrame(takt);

      // Rund dreitausend Zeilen weit rollen, in Schritten wie beim Mausrad.
      for (let i = 0; i < 120; i += 1) {
        baum.scrollTop += 700;
        await new Promise<void>((fertig) => requestAnimationFrame(() => fertig()));
      }
      laeuft = false;
      // Die ersten beiden Abstaende gehoeren noch zum Anlauf.
      return abstaende.slice(2);
    });

    expect(rahmen).not.toBeNull();
    const schlimmster = Math.max(...rahmen!);
    const p95 = perzentil(rahmen!, 0.95);
    console.log(
      `  Rahmenabstand: 95. Perzentil ${p95.toFixed(1)} ms, schlimmster ${schlimmster.toFixed(1)} ms`,
    );

    // Stocken heisst: ein Rahmen faellt sichtbar aus dem Takt. Drei Rahmen bei 60 Hz sind
    // die Grenze, ab der das Auge es merkt.
    expect(p95).toBeLessThan(50);
  });
});
