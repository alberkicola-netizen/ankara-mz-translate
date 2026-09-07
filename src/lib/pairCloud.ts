import { supabase } from "./supabaseClient";
import { PUBLIC_SITE } from "./inviteUrl";
import type { SessionLang } from "../types";

const LANGS = new Set(["pt", "pt-BR", "pt-PT", "pt-AO", "tr", "en", "fr"]);
const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TTL_MS = 2 * 60 * 60 * 1000;

export function cloudSessionsEnabled(): boolean {
  return Boolean(supabase);
}

function newCode(): string {
  const buf = new Uint32Array(6);
  crypto.getRandomValues(buf);
  let code = "";
  for (const n of buf) code += ALPH[n % ALPH.length];
  return code;
}

function newToken(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function tokenToUuid(token: string): string {
  const h = token.replace(/-/g, "").padEnd(32, "0").slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export async function cloudCreate(
  lang: SessionLang,
): Promise<{ code: string; token: string; publicUrl: string } | null> {
  if (!supabase || !LANGS.has(lang)) return null;
  for (let i = 0; i < 8; i++) {
    const code = newCode();
    const token = newToken();
    const expires = new Date(Date.now() + TTL_MS).toISOString();
    const pair = await supabase.from("pair_sessions").insert({
      code,
      status: "waiting",
      a_token: token,
      a_lang: lang,
      expires_at: expires,
    });
    if (!pair.error) return { code, token, publicUrl: `${PUBLIC_SITE}/join/${code}` };
    const room = await supabase.from("rooms").insert({
      id: code,
      status: "open",
      max_participants: 2,
      expires_at: expires,
    });
    if (room.error) {
      if (/duplicate|23505/i.test(room.error.message) || /duplicate|23505/i.test(pair.error?.message || "")) continue;
      throw new Error(room.error.message);
    }
    const person = await supabase.from("participants").insert({
      id: tokenToUuid(token),
      room_id: code,
      display_name: "A",
      source_language: lang,
      target_language: lang,
    });
    if (person.error) throw new Error(person.error.message);
    return { code, token, publicUrl: `${PUBLIC_SITE}/join/${code}` };
  }
  throw new Error("create: code space");
}

export async function cloudGet(
  code: string,
): Promise<{ creatorLang: SessionLang; status: string; peerLang: SessionLang | null } | null> {
  if (!supabase) return null;
  const id = code.toUpperCase();
  const pair = await supabase.from("pair_sessions").select("a_lang, b_lang, status, expires_at").eq("code", id).maybeSingle();
  if (!pair.error && pair.data) {
    if (pair.data.expires_at && Date.now() > new Date(pair.data.expires_at).getTime()) return null;
    return {
      creatorLang: pair.data.a_lang as SessionLang,
      status: pair.data.status,
      peerLang: (pair.data.b_lang as SessionLang) || null,
    };
  }
  const room = await supabase.from("rooms").select("*").eq("id", id).maybeSingle();
  if (room.error || !room.data) return null;
  if (room.data.expires_at && Date.now() > new Date(room.data.expires_at).getTime()) return null;
  const people = await supabase.from("participants").select("*").eq("room_id", id).order("joined_at");
  const list = people.error ? [] : people.data || [];
  const a = list[0];
  const b = list[1];
  return {
    creatorLang: (a?.source_language as SessionLang) || "pt",
    status: b ? "active" : "waiting",
    peerLang: b ? (b.source_language as SessionLang) : null,
  };
}

export async function publishJoinBeacon(code: string, lang: SessionLang, role: "a" | "b"): Promise<void> {
  if (!supabase || !LANGS.has(lang)) return;
  const id = String(code || "").toUpperCase();
  const expires = new Date(Date.now() + TTL_MS).toISOString();
  try {
    if (role === "b") {
      await supabase.from("pair_sessions").update({ b_lang: lang, status: "active" }).eq("code", id);
      const room = await supabase.from("rooms").upsert(
        { id, status: "active", max_participants: 2, expires_at: expires },
        { onConflict: "id" },
      );
      if (room.error) await supabase.from("rooms").update({ status: "active" }).eq("id", id);
      await supabase.from("participants").insert({
        id: tokenToUuid(newToken()),
        room_id: id,
        display_name: "B",
        source_language: lang,
        target_language: lang,
      });
      return;
    }
    await supabase.from("pair_sessions").upsert(
      { code: id, status: "waiting", a_lang: lang, expires_at: expires },
      { onConflict: "code" },
    );
    await supabase.from("rooms").upsert(
      { id, status: "open", max_participants: 2, expires_at: expires },
      { onConflict: "id" },
    );
  } catch {
    /* beacon is best-effort */
  }
}

export async function readJoinBeacon(
  code: string,
): Promise<{ peerLang: SessionLang } | null> {
  if (!supabase) return null;
  const id = String(code || "").toUpperCase();
  const pair = await supabase.from("pair_sessions").select("status, b_lang").eq("code", id).maybeSingle();
  if (!pair.error && pair.data?.status === "active" && pair.data.b_lang) {
    return { peerLang: pair.data.b_lang as SessionLang };
  }
  const people = await supabase.from("participants").select("display_name, source_language").eq("room_id", id);
  const b = (people.data || []).find((p) => p.display_name === "B");
  if (b?.source_language) return { peerLang: b.source_language as SessionLang };
  const room = await supabase.from("rooms").select("status").eq("id", id).maybeSingle();
  const st = String(room.data?.status || "");
  if (st === "active" || st === "paired") return { peerLang: "pt" };
  return null;
}

export function watchJoinBeacon(code: string, onPeer: (lang: SessionLang) => void): () => void {
  let stop = false;
  let seen = false;
  async function tick() {
    if (stop || seen) return;
    try {
      const hit = await readJoinBeacon(code);
      if (hit) {
        seen = true;
        onPeer(hit.peerLang);
        return;
      }
    } catch {
      /* keep polling */
    }
    if (!stop) window.setTimeout(() => void tick(), 900);
  }
  void tick();
  return () => {
    stop = true;
  };
}

export async function cloudJoin(
  code: string,
  lang: SessionLang,
): Promise<{ token: string; creatorLang: SessionLang } | "full" | "gone" | null> {
  if (!supabase || !LANGS.has(lang)) return null;
  const found = await cloudGet(code);
  if (!found) return null;
  if (found.status === "active") return "full";
  const token = newToken();
  const pair = await supabase
    .from("pair_sessions")
    .update({ b_token: token, b_lang: lang, status: "active" })
    .eq("code", code.toUpperCase())
    .is("b_token", null);
  if (!pair.error) return { token, creatorLang: found.creatorLang };
  const person = await supabase.from("participants").insert({
    id: tokenToUuid(token),
    room_id: code.toUpperCase(),
    display_name: "B",
    source_language: lang,
    target_language: lang,
  });
  if (person.error) {
    if (/duplicate|23505|row-level|42501|permission|RLS/i.test(person.error.message)) return null;
    throw new Error(person.error.message);
  }
  return { token, creatorLang: found.creatorLang };
}
