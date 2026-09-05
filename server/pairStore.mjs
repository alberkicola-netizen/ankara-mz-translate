import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomInt } from "node:crypto";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newPairCode() {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function newPairToken() {
  return randomBytes(16).toString("hex");
}

export const PUBLIC_SITE = (
  process.env.PUBLIC_SITE ||
  process.env.VITE_PUBLIC_SITE ||
  "https://ankara-mz-translate.vercel.app"
).replace(/\/$/, "");

export function joinPublicUrl(code) {
  return `${PUBLIC_SITE}/join/${String(code || "").toUpperCase()}`;
}

function tokenToUuid(token) {
  const h = String(token || "").replace(/-/g, "").padEnd(32, "0").slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function uuidToToken(id) {
  return String(id || "").replace(/-/g, "");
}

export function createPairStore() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const supa = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  function unwrap({ data, error }) {
    if (error) throw new Error(`pair_store: ${error.message}`);
    return data;
  }

  return {
    async insert(row) {
      const pair = await supa.from("pair_sessions").insert(row).select().single();
      if (!pair.error) return pair.data;
      unwrap(
        await supa.from("rooms").insert({
          id: row.code,
          status: "open",
          max_participants: 2,
          expires_at: row.expires_at,
        }),
      );
      unwrap(
        await supa.from("participants").insert({
          id: tokenToUuid(row.a_token),
          room_id: row.code,
          display_name: "A",
          source_language: row.a_lang,
          target_language: row.a_lang,
        }),
      );
      return row;
    },

    async get(code) {
      const id = String(code || "").toUpperCase();
      const pair = await supa.from("pair_sessions").select("*").eq("code", id).maybeSingle();
      if (!pair.error && pair.data) {
        if (pair.data.expires_at && Date.now() > new Date(pair.data.expires_at).getTime()) return null;
        return pair.data;
      }
      const room = unwrap(await supa.from("rooms").select("*").eq("id", id).maybeSingle());
      if (!room) return null;
      if (room.expires_at && Date.now() > new Date(room.expires_at).getTime()) return null;
      const people = unwrap(await supa.from("participants").select("*").eq("room_id", id).order("joined_at"));
      const a = people?.[0];
      const b = people?.[1];
      if (!a) return null;
      return {
        code: id,
        status: b ? "active" : "waiting",
        a_token: uuidToToken(a.id),
        a_lang: a.source_language,
        b_token: b ? uuidToToken(b.id) : null,
        b_lang: b?.source_language ?? null,
        expires_at: room.expires_at,
      };
    },

    async join(code, lang, token) {
      const row = await this.get(code);
      if (!row) return "gone";
      if (row.b_token) return "full";
      const pair = await supa
        .from("pair_sessions")
        .update({ b_token: token, b_lang: lang, status: "active" })
        .eq("code", row.code)
        .is("b_token", null);
      if (!pair.error) return { ...row, b_token: token, b_lang: lang, status: "active" };
      unwrap(
        await supa.from("participants").insert({
          id: tokenToUuid(token),
          room_id: row.code,
          display_name: "B",
          source_language: lang,
          target_language: lang,
        }),
      );
      return { ...row, b_token: token, b_lang: lang, status: "active" };
    },
  };
}
