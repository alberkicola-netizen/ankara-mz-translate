/**
 * Provedores externos (tradução e STT) usados pelas salas multi-participante.
 * Todos são injetáveis em rooms.mjs, para os testes correrem com fakes.
 */

const LANG_NAMES = {
  pt: "Mozambican Portuguese",
  "pt-BR": "Brazilian Portuguese",
  "pt-PT": "European Portuguese (Portugal)",
  "pt-AO": "Angolan Portuguese",
  tr: "Turkish",
  en: "English",
  fr: "French",
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_TTS_URL = "https://openrouter.ai/api/v1/audio/speech";
const DEFAULT_MODEL = "openai/gpt-4o-mini";
const DEFAULT_TTS_MODEL = "openai/tts-1";
const DEFAULT_STT_URL = "https://api.openai.com/v1/audio/transcriptions";
const CACHE_MAX = 250;
const CACHE_TTL_MS = 30 * 60 * 1000;

const OR_HEADERS = {
  "http-referer": "https://tika-mz-translator.local",
  "x-title": "TIKA Ankara University - Mozambique Translator",
};

const TTS_VOICE = {
  pt: "nova",
  "pt-BR": "nova",
  "pt-PT": "nova",
  "pt-AO": "nova",
  tr: "onyx",
  en: "alloy",
  fr: "shimmer",
};

function orAuth(apiKey, extra = {}) {
  return {
    authorization: `Bearer ${apiKey}`,
    ...OR_HEADERS,
    ...extra,
  };
}

function cacheGet(cache, key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, hit);
  return hit.text;
}

function cacheSet(cache, key, text) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, { text, at: Date.now() });
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

/** Tradução de texto via OpenRouter (gpt-4o-mini — rápido; gpt-audio é só para voz). */
export function createOpenRouterTranslator({ apiKey, model, timeoutMs = 10_000 }) {
  const preferred = model || DEFAULT_MODEL;
  const chain = [...new Set([preferred, DEFAULT_MODEL])];
  const cache = new Map();

  async function once(text, from, to, modelId) {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "content-type": "application/json",
        ...orAuth(apiKey),
      },
      body: JSON.stringify({
        model: modelId,
        temperature: 0.1,
        max_tokens: 400,
        messages: [
          {
            role: "system",
            content:
              `Professional medical interpreter (Turkey–Mozambique). ` +
              `Translate ${LANG_NAMES[from] || from} → ${LANG_NAMES[to] || to}. ` +
              `Portuguese varieties: use that spelling/vocabulary. ` +
              `Translation only — no quotes or notes. Keep drug names, doses, abbreviations.`,
          },
          { role: "user", content: text },
        ],
      }),
    });
    if (!res.ok) throw new Error(`openrouter ${res.status}`);
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content ?? "";
    const out = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    if (!out) throw new Error("openrouter: empty response");
    return out;
  }

  return async function translate(text, from, to) {
    const key = `${from}|${to}|${text}`;
    const cached = cacheGet(cache, key);
    if (cached) return cached;
    let last;
    for (const modelId of chain) {
      try {
        const out = await once(text, from, to, modelId);
        cacheSet(cache, key, out);
        return out;
      } catch (err) {
        last = err;
      }
    }
    throw last;
  };
}

/** Tradução mock da Fase 1 (usada quando OPENROUTER_API_KEY não está definida). */
export function createMockTranslator() {
  return async function translate(text, _from, to) {
    return `[traduzido→${to}] ${text}`;
  };
}

/** TTS via OpenRouter /audio/speech (gpt-4o-mini-tts) — voz no recetor, não no emissor. */
export function createOpenRouterTts({ apiKey, model, timeoutMs = 20_000 }) {
  return async function speak(text, lang) {
    const res = await fetch(OPENROUTER_TTS_URL, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "content-type": "application/json",
        ...orAuth(apiKey),
      },
      body: JSON.stringify({
        model: model || DEFAULT_TTS_MODEL,
        input: text,
        voice: TTS_VOICE[lang] || "alloy",
        response_format: "mp3",
        provider: {
          options: {
            openai: {
              instructions: `Speak clearly in ${LANG_NAMES[lang] || lang}, natural pace, hospital ward volume.`,
            },
          },
        },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`tts ${res.status}: ${detail}`.slice(0, 300));
    }
    return await res.arrayBuffer();
  };
}

/** STT via Whisper (OpenAI directo ou OpenRouter /v1/audio/transcriptions). */
export function createWhisperTranscriber({ apiKey, url, model = "whisper-1", timeoutMs = 60_000 }) {
  const endpoint = url || DEFAULT_STT_URL;
  const viaOpenRouter = endpoint.includes("openrouter.ai");
  return async function transcribe({ buffer, mimetype, filename = "audio.webm", language }) {
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: mimetype || "audio/webm" }), filename);
    form.append("model", model);
    if (language) form.append("language", language);
    const res = await fetch(endpoint, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: viaOpenRouter ? orAuth(apiKey) : { authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`stt ${res.status}: ${detail}`.slice(0, 300));
    }
    const data = await res.json();
    return String(data?.text || "").trim();
  };
}
