import { Fragment } from "react";

/**
 * Die Antwort des Modells, lesbar gemacht.
 *
 * Modelle schreiben Markdown, ob man sie darum bittet oder nicht. Ungerendert steht dann
 * `**AddressInformation**` im Panel und eine Aufzaehlung als eine einzige lange Zeile.
 *
 * Bewusst **kein** Markdown-Paket: der Startbund liegt bei 163 KB gzip mit einer
 * gemessenen Zusage, und react-markdown samt remark waere ein Vielfaches dessen, was
 * diese drei Auszeichnungen wert sind. Was hier fehlt (Tabellen, Ueberschriften,
 * Verweise) braucht eine Chat-Antwort ueber ein Teilmodell nicht.
 */

const AUSZEICHNUNG = /(\*\*[^*]+\*\*|`[^`]+`)/g;

function Zeile({ text }: { readonly text: string }) {
  return (
    <>
      {text.split(AUSZEICHNUNG).map((stueck, i) => {
        if (stueck.startsWith("**") && stueck.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold">
              {stueck.slice(2, -2)}
            </strong>
          );
        }
        if (stueck.startsWith("`") && stueck.endsWith("`")) {
          return (
            <code key={i} className="rounded bg-muted px-1 font-mono text-2xs">
              {stueck.slice(1, -1)}
            </code>
          );
        }
        return <Fragment key={i}>{stueck}</Fragment>;
      })}
    </>
  );
}

/** Ein Absatz oder eine Punktliste. Leerzeilen trennen, sie verschwinden nicht. */
type Block = { readonly art: "absatz"; readonly zeilen: string[] } | {
  readonly art: "liste";
  readonly punkte: string[];
};

function bloecke(text: string): Block[] {
  const ergebnis: Block[] = [];

  for (const zeile of text.split("\n")) {
    const punkt = /^\s*[-*]\s+(.*)$/.exec(zeile);
    const letzter = ergebnis[ergebnis.length - 1];

    if (punkt !== null) {
      if (letzter?.art === "liste") letzter.punkte.push(punkt[1] ?? "");
      else ergebnis.push({ art: "liste", punkte: [punkt[1] ?? ""] });
      continue;
    }

    if (zeile.trim() === "") {
      // Leerzeile beendet den laufenden Block, erzeugt aber keinen leeren.
      if (letzter !== undefined) ergebnis.push({ art: "absatz", zeilen: [] });
      continue;
    }

    if (letzter?.art === "absatz") letzter.zeilen.push(zeile);
    else ergebnis.push({ art: "absatz", zeilen: [zeile] });
  }

  return ergebnis.filter((block) => (block.art === "liste" ? true : block.zeilen.length > 0));
}

export function AssistentText({ text }: { readonly text: string }) {
  return (
    <div className="flex flex-col gap-2 text-secondary-foreground">
      {bloecke(text).map((block, i) =>
        block.art === "liste" ? (
          <ul key={i} className="flex flex-col gap-0.5">
            {block.punkte.map((punkt, j) => (
              <li key={j} className="flex gap-1.5">
                <span aria-hidden className="text-foreground-faint">
                  •
                </span>
                <span className="min-w-0 flex-1">
                  <Zeile text={punkt} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            {block.zeilen.map((zeile, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                <Zeile text={zeile} />
              </Fragment>
            ))}
          </p>
        ),
      )}
    </div>
  );
}
