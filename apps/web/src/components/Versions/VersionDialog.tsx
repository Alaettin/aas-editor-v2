import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { versionsApi, type VersionSummary } from "@/api/projects";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useEditor } from "@/store/editor";

interface Props {
  readonly offen: boolean;
  readonly onClose: () => void;
}

export function VersionDialog({ offen, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const projektId = useEditor((state) => state.projektId);
  const versionAnlegen = useEditor((state) => state.versionAnlegen);
  const versionLaden = useEditor((state) => state.versionLaden);

  const [versionen, setVersionen] = useState<readonly VersionSummary[]>([]);
  const [label, setLabel] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  const datum = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" });

  const laden = useCallback(async () => {
    if (projektId === null) return;
    const page = await versionsApi.list(projektId);
    setVersionen(page.items);
  }, [projektId]);

  useEffect(() => {
    if (offen) void laden();
  }, [offen, laden]);

  const anlegen = async () => {
    setLaeuft(true);
    await versionAnlegen(label.trim() === "" ? null : label.trim());
    setLabel("");
    await laden();
    setLaeuft(false);
  };

  return (
    <Dialog open={offen} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("versionen.titel")}</DialogTitle>
          <DialogDescription>{t("versionen.text")}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input
            value={label}
            placeholder={t("versionen.labelPlatzhalter")}
            onChange={(event) => setLabel(event.target.value)}
          />
          <Button disabled={laeuft || projektId === null} onClick={() => void anlegen()}>
            {t("versionen.anlegen")}
          </Button>
        </div>

        <ul className="max-h-72 divide-y divide-border overflow-auto rounded-md border border-border">
          {versionen.length === 0 ? (
            <li className="px-3 py-4 text-sm text-muted-foreground">{t("versionen.leer")}</li>
          ) : null}
          {versionen.map((version) => (
            <li key={version.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm">
                  {version.label ?? t("versionen.ohneLabel")}
                </span>
                <span className="block text-2xs text-muted-foreground" data-numeric>
                  {t("versionen.zeile", {
                    datum: datum.format(version.createdAt),
                    revision: version.revision,
                    knoten: version.nodeCount,
                  })}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void versionLaden(version.id);
                  onClose();
                }}
              >
                {t("versionen.laden")}
              </Button>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("versionen.schliessen")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
