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
  const list = people.data || [];
  const a = list[0];
  if (!a) return null;
  return {
    creatorLang: a.source_language as SessionLang,
    status: list[1] ? "active" : "waiting",
    peerLang: list[1] ? (list[1].source_language as SessionLang) : null,
  };
}

export async function cloudJoin(
  code: string,
  lang: SessionLang,
): Promise<{ token: string; creatorLang: SessionLang } | "full" | "gone" | null> {
  if (!supabase || !LANGS.has(lang)) return null;
  const found = await cloudGet(code);
  if (!found) return "gone";
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
    if (/duplicate|23505|row-level|42501|permission/i.test(person.error.message)) return "gone";
    throw new Error(person.error.message);
  }
  return { token, creatorLang: found.creatorLang };
}
