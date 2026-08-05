import { useEffect } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router";

import { onSitzungAbgelaufen } from "@/api/client";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/store/auth";

/**
 * Prueft einmal beim Betreten, ob eine gueltige Sitzung besteht, und meldet dem
 * API-Klienten, wohin er bei einem spaeteren 401 lenken soll. So kennt der Klient den
 * Router nicht und der Router nicht den Klienten.
 */
export function RequireAuth() {
  const status = useAuth((state) => state.status);
  const pruefe = useAuth((state) => state.pruefe);
  const sitzungVerloren = useAuth((state) => state.sitzungVerloren);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (status === "unbekannt") void pruefe();
  }, [status, pruefe]);

  useEffect(() => {
    onSitzungAbgelaufen(() => {
      sitzungVerloren();
      void navigate("/login", { replace: true });
    });
    return () => onSitzungAbgelaufen(null);
  }, [navigate, sitzungVerloren]);

  if (status === "unbekannt" || status === "prueft") {
    return (
      <div className="flex h-screen flex-col gap-3 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="min-h-0 flex-1 w-full" />
      </div>
    );
  }

  if (status === "abgemeldet") {
    return <Navigate to="/login" replace state={{ von: location.pathname }} />;
  }

  return <Outlet />;
}
