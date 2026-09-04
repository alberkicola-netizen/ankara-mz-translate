import { Navigate, Outlet, useLocation } from "react-router-dom";
import { isUnlocked } from "../lib/storage";

export function RequireAuth() {
  const loc = useLocation();
  if (!isUnlocked()) {
    const q = new URLSearchParams();
    const pin = new URLSearchParams(loc.search).get("pin");
    if (pin) q.set("pin", pin);
    const next = loc.pathname + loc.search;
    if (next && next !== "/" && !next.startsWith("/gate")) q.set("next", next);
    return <Navigate to={q.toString() ? `/gate?${q}` : "/gate"} replace />;
  }
  return <Outlet />;
}
