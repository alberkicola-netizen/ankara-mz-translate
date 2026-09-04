import type { SessionLang } from "../types";

const KEY = "ank-mz-unlocked";
const FAV = "ank-mz-favorites";
const UI = "ank-mz-ui-lang";
const EVALS = "ank-mz-evals";
const TRAINED = "ank-mz-trained";
const HIST = "ank-mz-history";

export function isUnlocked(): boolean {
  return sessionStorage.getItem(KEY) === "1";
}

export function setUnlocked(): void {
  sessionStorage.setItem(KEY, "1");
}

export function lock(): void {
  sessionStorage.removeItem(KEY);
}

export function getUiLang(): "pt" | "tr" | "en" {
  const v = localStorage.getItem(UI);
  if (v === "pt" || v === "tr" || v === "en") return v;
  return "pt";
}

export function setUiLang(lang: "pt" | "tr" | "en"): void {
  localStorage.setItem(UI, lang);
}

export function getFavorites(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FAV) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function toggleFavorite(id: string): string[] {
  const cur = new Set(getFavorites());
  if (cur.has(id)) cur.delete(id);
  else cur.add(id);
  const next = [...cur];
  localStorage.setItem(FAV, JSON.stringify(next));
  return next;
}

export type EvalRecord = {
  role: "observer" | "preceptor";
  at: string;
  scores: Record<string, string>;
};

export function saveEval(record: EvalRecord): void {
  const all = getEvals();
  all.push(record);
  localStorage.setItem(EVALS, JSON.stringify(all));
}

export function getEvals(): EvalRecord[] {
  try {
    return JSON.parse(localStorage.getItem(EVALS) ?? "[]") as EvalRecord[];
  } catch {
    return [];
  }
}

export type HistoryTurn = {
  heard: string;
  translated: string;
  from: SessionLang;
  to: SessionLang;
  at: string;
};

export function getHistory(): HistoryTurn[] {
  try {
    return JSON.parse(localStorage.getItem(HIST) ?? "[]") as HistoryTurn[];
  } catch {
    return [];
  }
}

export function addHistory(turn: HistoryTurn): void {
  const all = [turn, ...getHistory()].slice(0, 100);
  localStorage.setItem(HIST, JSON.stringify(all));
}

export function clearHistory(): void {
  localStorage.removeItem(HIST);
}

export function markTrained(): void {
  localStorage.setItem(TRAINED, "1");
}

export function isTrained(): boolean {
  return localStorage.getItem(TRAINED) === "1";
}
