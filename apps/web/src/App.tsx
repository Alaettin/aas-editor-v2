import { useCallback, useRef, useState } from "react";

import { aasWorker, type OpenResult, type ValidationIssue } from "./worker/bridge.js";

/**
 * Testseite fuer Phase 2. Sie belegt, dass die Worker-Bruecke traegt: Datei hinein,
 * Format und Version erkannt, Modell aufgebaut, Validierung gelaufen, Export heraus.
 *
 * Die eigentliche Oberflaeche entsteht in Phase 3. Hier wird bewusst nichts gestaltet,
 * was dort ohnehin neu entsteht.
 */

type Status = { kind: "leer" } | { kind: "laedt" } | { kind: "fehler"; message: string };

export function App() {
  const [status, setStatus] = useState<Status>({ kind: "leer" });
  const [result, setResult] = useState<OpenResult | null>(null);
  const [issues, setIssues] = useState<readonly ValidationIssue[] | null>(null);
  const [nodeCount, setNodeCount] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const open = useCallback(async (file: File) => {
    setStatus({ kind: "laedt" });
    setIssues(null);
    try {
      const worker = aasWorker();
      const bytes = new Uint8Array(await file.arrayBuffer());
      const opened = await worker.open(bytes, file.name);
      setResult(opened);
      setNodeCount(await worker.nodeCount());
      setIssues(await worker.validate());
      setStatus({ kind: "leer" });
    } catch (error) {
      setResult(null);
      setStatus({ kind: "fehler", message: (error as Error).message });
    }
  }, []);

  const download = useCallback(async (format: "json" | "xml" | "aasx") => {
    try {
      const exported = await aasWorker().exportAs(format);
      const blob = new Blob([exported.bytes as BlobPart], { type: exported.contentType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = exported.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setStatus({ kind: "fehler", message: (error as Error).message });
    }
  }, []);

  return (
    <main
      className="mx-auto min-h-screen max-w-3xl p-8"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file) void open(file);
      }}
    >
      <h1 className="text-xl font-semibold">AAS Editor</h1>
      <p className="mt-1 text-sm text-text-muted">
        Testseite fuer Import und Export im Worker. Die Oberflaeche folgt in Phase 3.
      </p>

      <div className="mt-6 rounded-lg border border-border-strong border-dashed p-8 text-center">
        <p className="text-sm text-text-muted">
          JSON, XML oder AASX hier ablegen, Metamodell 3.0 oder 3.1.
        </p>
        <button
          type="button"
          className="mt-3 rounded-md bg-accent px-3 py-1.5 text-sm text-text-on-accent"
          onClick={() => inputRef.current?.click()}
        >
          Datei waehlen
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".json,.xml,.aasx"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void open(file);
          }}
        />
      </div>

      {status.kind === "laedt" && <p className="mt-4 text-sm text-text-muted">Wird gelesen ...</p>}

      {status.kind === "fehler" && (
        <p className="mt-4 rounded-md bg-danger-subtle p-3 text-sm text-danger">{status.message}</p>
      )}

      {result && (
        <section className="mt-6 space-y-4 text-sm">
          <dl className="grid grid-cols-[10rem_1fr] gap-y-1">
            <dt className="text-text-muted">Format</dt>
            <dd>{result.format}</dd>
            <dt className="text-text-muted">Version der Quelle</dt>
            <dd>{result.sourceVersion}</dd>
            <dt className="text-text-muted">Knoten im Modell</dt>
            <dd data-numeric>{nodeCount ?? "-"}</dd>
            <dt className="text-text-muted">Anhaenge</dt>
            <dd data-numeric>{result.attachments.length}</dd>
            <dt className="text-text-muted">Thumbnail</dt>
            <dd>{result.hasThumbnail ? "vorhanden" : "keines"}</dd>
          </dl>

          {result.upgradeNotes.length > 0 && (
            <ul className="rounded-md bg-surface-sunken p-3">
              {result.upgradeNotes.map((note) => (
                <li key={note.rule}>
                  Upgrade, Diff-Zeile {note.rule}: {note.message}
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2">
            {(["json", "xml", "aasx"] as const).map((format) => (
              <button
                key={format}
                type="button"
                className="rounded-md border border-border-strong px-3 py-1.5"
                onClick={() => void download(format)}
              >
                Export {format.toUpperCase()}
              </button>
            ))}
          </div>

          {issues && (
            <div>
              <h2 className="font-medium">
                Validierung: {issues.filter((i) => i.severity === "constraint").length} Constraints,{" "}
                {issues.filter((i) => i.severity === "warnung").length} Warnungen
              </h2>
              <ul className="mt-2 space-y-1">
                {issues.slice(0, 25).map((issue, index) => (
                  <li
                    key={`${issue.aasPath}-${index}`}
                    className={
                      issue.severity === "constraint"
                        ? "rounded-sm bg-danger-subtle p-2 text-danger"
                        : "rounded-sm bg-warning-subtle p-2 text-warning"
                    }
                  >
                    <span className="font-mono text-xs">{issue.constraintId ?? "Warnung"}</span>{" "}
                    {issue.message}
                    <span className="block font-mono text-2xs text-text-faint">
                      {issue.aasPath || "(Wurzel)"} → {issue.nodeId ?? "?"} / {issue.field || "-"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
