import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Cliente Supabase do frontend (apenas Realtime: broadcast + presence).
 * `null` quando o .env ainda não tem VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY —
 * as páginas de sala mostram um aviso em vez de rebentar.
 */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { heartbeatIntervalMs: 15_000, timeout: 20_000 },
      })
    : null;
