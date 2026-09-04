import type { Phrase, SessionLang } from "../types";

const VOICE_LANG: Record<SessionLang, string[]> = {
  pt: ["pt-BR", "pt-PT"],
  "pt-BR": ["pt-BR"],
  "pt-PT": ["pt-PT", "pt-BR"],
  "pt-AO": ["pt-PT", "pt-BR"],
  tr: ["tr-TR"],
  en: ["en-US", "en-GB"],
  fr: ["fr-FR"],
};

/** Web Speech has no Mozambican/Angolan locales — map each variant to the closest engine. */
export const STT_LANG: Record<SessionLang, string> = {
  pt: "pt-BR",
  "pt-BR": "pt-BR",
  "pt-PT": "pt-PT",
  "pt-AO": "pt-PT",
  tr: "tr-TR",
  en: "en-US",
  fr: "fr-FR",
};

function pickVoice(lang: SessionLang): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices();
  const wanted = VOICE_LANG[lang];
  for (const code of wanted) {
    const exact = voices.find((x) => x.lang.replace("_", "-").toLowerCase() === code.toLowerCase());
    if (exact) return exact;
  }
  const prefix = wanted[0].slice(0, 2).toLowerCase();
  return voices.find((x) => x.lang.toLowerCase().startsWith(prefix)) ?? voices[0];
}

function whenVoicesReady(fn: () => void): void {
  if (speechSynthesis.getVoices().length) {
    fn();
    return;
  }
  speechSynthesis.addEventListener("voiceschanged", fn, { once: true });
  setTimeout(fn, 400);
}

/** Must run inside a tap. Mobile browsers block later TTS without this. */
export function unlockSpeech(): void {
  try {
    const silent = new SpeechSynthesisUtterance(".");
    silent.volume = 0.01;
    silent.rate = 2;
    speechSynthesis.speak(silent);
    speechSynthesis.cancel();
    const arm = new SpeechSynthesisUtterance(".");
    arm.volume = 0.01;
    arm.rate = 2;
    speechSynthesis.speak(arm);
  } catch {
    /* ignore */
  }
  unlockCloudAudio();
}

let cloudAudio: HTMLAudioElement | null = null;

function unlockCloudAudio(): void {
  try {
    if (!cloudAudio) cloudAudio = new Audio();
    cloudAudio.src =
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
    void cloudAudio.play().catch(() => undefined);
  } catch {
    /* ignore */
  }
}

async function speakCloud(text: string, lang: SessionLang): Promise<boolean> {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, lang }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return false;
    const blob = await res.blob();
    if (blob.size < 80) return false;
    if (!cloudAudio) cloudAudio = new Audio();
    const prev = cloudAudio.src;
    const url = URL.createObjectURL(blob);
    cloudAudio.src = url;
    await cloudAudio.play();
    if (prev.startsWith("blob:")) URL.revokeObjectURL(prev);
    return true;
  } catch {
    return false;
  }
}

export function speak(
  text: string,
  lang: SessionLang,
  opts?: { rate?: number; onEnd?: () => void },
): void {
  const runLocal = () => {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = VOICE_LANG[lang][0];
    u.volume = 1;
    const voice = pickVoice(lang);
    if (voice) u.voice = voice;
    u.rate = opts?.rate ?? 0.95;
    if (opts?.onEnd) {
      u.onend = opts.onEnd;
      u.onerror = opts.onEnd;
    }
    speechSynthesis.speak(u);
  };
  void speakCloud(text, lang).then((ok) => {
    if (ok) {
      if (cloudAudio && opts?.onEnd) {
        cloudAudio.onended = () => opts.onEnd?.();
        cloudAudio.onerror = () => opts.onEnd?.();
      } else opts?.onEnd?.();
      return;
    }
    whenVoicesReady(runLocal);
  });
}

export function stopSpeak(): void {
  speechSynthesis.cancel();
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchPhrases(recognized: string, phrases: Phrase[], limit = 5): Phrase[] {
  const q = normalize(recognized);
  if (!q) return [];
  const words = new Set(q.split(" ").filter((w) => w.length > 2));
  const scored = phrases.map((ph) => {
    const blob = normalize(`${ph.pt} ${ph.tr} ${ph.en}`);
    let score = 0;
    if (blob.includes(q) || q.includes(blob.slice(0, 40))) score += 10;
    for (const w of words) {
      if (blob.includes(w)) score += 1;
    }
    return { ph, score };
  });
  return scored
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.ph);
}

type Recog = {
  start: () => void;
  stop: () => void;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export function getRecognizer(): Recog | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => Recog;
    webkitSpeechRecognition?: new () => Recog;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.maxAlternatives = 3;
  rec.interimResults = true;
  return rec;
}
