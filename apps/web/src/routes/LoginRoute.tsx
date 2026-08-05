import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/store/auth";

export function LoginRoute() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const status = useAuth((state) => state.status);
  const fehler = useAuth((state) => state.fehler);
  const anmelden = useAuth((state) => state.anmelden);

  const [benutzer, setBenutzer] = useState("");
  const [passwort, setPasswort] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  const ziel = (location.state as { von?: string } | null)?.von ?? "/projekte";

  useEffect(() => {
    if (status === "angemeldet") void navigate(ziel, { replace: true });
  }, [status, navigate, ziel]);

  const absenden = async (event: FormEvent) => {
    event.preventDefault();
    setLaeuft(true);
    const erfolg = await anmelden(benutzer, passwort);
    setLaeuft(false);
    if (erfolg) void navigate(ziel, { replace: true });
  };

  return (
    <div className="flex h-screen items-center justify-center bg-background p-6">
      <form
        onSubmit={(event) => void absenden(event)}
        className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-(--shadow-overlay)"
      >
        <h1 className="text-lg font-semibold">{t("app.titel")}</h1>
        <p className="mt-1 mb-5 text-sm text-muted-foreground">{t("anmeldung.hinweis")}</p>

        <Field className="mb-3">
          <FieldLabel htmlFor="benutzer">{t("anmeldung.benutzer")}</FieldLabel>
          <Input
            id="benutzer"
            name="benutzer"
            autoComplete="username"
            autoFocus
            value={benutzer}
            onChange={(event) => setBenutzer(event.target.value)}
          />
        </Field>

        <Field className="mb-5">
          <FieldLabel htmlFor="passwort">{t("anmeldung.passwort")}</FieldLabel>
          <Input
            id="passwort"
            name="passwort"
            type="password"
            autoComplete="current-password"
            value={passwort}
            onChange={(event) => setPasswort(event.target.value)}
          />
        </Field>

        {fehler ? (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {fehler}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={laeuft || benutzer === ""}>
          {laeuft ? t("anmeldung.laeuft") : t("anmeldung.anmelden")}
        </Button>
      </form>
    </div>
  );
}
