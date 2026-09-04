import { Navigate, Outlet, useLocation } from "react-router-dom";
import { isUnlocked } from "../lib/storage";

export function RequireAuth() {
  const loc = useLocation();
  if (!isUnlocked()) {
    const pin = new URLSearchParams(loc.search).get("pin");
    const to = pin ? `/gate?pin=${encodeURIComponent(pin)}` : "/gate";
    return <Navigate to={to} replace />;
  }
  return <Outlet />;
}
