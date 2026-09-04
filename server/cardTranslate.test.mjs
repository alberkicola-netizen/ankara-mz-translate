import test from "node:test";
import assert from "node:assert/strict";
import { cardTranslate } from "./cardTranslate.mjs";

test("cartão aprovado traduz sem IA", () => {
  const out = cardTranslate("Olá. Sou enfermeira observadora de Moçambique.", "pt", "tr");
  assert.ok(out);
  assert.match(out, /hemşire|Merhaba/i);
});

test("cartão inverso tr → pt", () => {
  const out = cardTranslate("Merhaba. Mozambik’ten gözlemci hemşireyim.", "tr", "pt");
  assert.ok(out);
  assert.match(out, /Olá/i);
});

test("francês sem cartão devolve null", () => {
  assert.equal(cardTranslate("Bonjour", "fr", "pt"), null);
});
