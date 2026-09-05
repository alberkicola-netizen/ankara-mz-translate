import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log("pair_sessions: skip (no service role in env)");
  process.exit(0);
}
const supa = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { error } = await supa.from("pair_sessions").select("code").limit(1);
if (!error) {
  console.log("pair_sessions: ok");
  process.exit(0);
}
console.log("pair_sessions: missing — run supabase/schema.sql in the Supabase SQL editor");
process.exit(1);
