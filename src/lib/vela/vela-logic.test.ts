// Tests for VELA's core rules that run without a database: the photo veil,
// the public Resonanz formula (README) and the word filter (Apple 1.2).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isUnveiled, resonance, resonanceParts, RESONANCE, VEIL_AFTER, nextQuestion, PROMPT_BANK } from "./data.ts";
import { isObjectionable, normalizeForFilter } from "./content-filter.ts";

describe("veil", () => {
  it("stays closed until both people have written enough", () => {
    assert.equal(isUnveiled(0, 0), false);
    assert.equal(isUnveiled(VEIL_AFTER, VEIL_AFTER - 1), false);
    assert.equal(isUnveiled(VEIL_AFTER - 1, VEIL_AFTER), false);
    assert.equal(isUnveiled(50, 0), false);
    assert.equal(isUnveiled(VEIL_AFTER, VEIL_AFTER), true);
    assert.equal(isUnveiled(VEIL_AFTER + 4, VEIL_AFTER + 1), true);
  });

  it("never sends a photo in the swipe deck or for veiled matches", () => {
    // Guard against regressions in the server code: Person has no photo field
    // and match photos are only set behind the unveil check.
    const dataSrc = readFileSync(new URL("./data.ts", import.meta.url), "utf8");
    const person = dataSrc.slice(dataSrc.indexOf("export type Person"), dataSrc.indexOf("export type Message"));
    assert.ok(!/photo/.test(person), "Person (deck/inbound cards) must not carry a photo");
    const apiSrc = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
    assert.match(apiSrc, /photo: unveiled \? row\.photo : null/);
  });
});

describe("resonance", () => {
  const me = { orbit: "depth" as const, values: ["Neugier", "Humor", "Ruhe"] };

  it("follows the published formula", () => {
    assert.equal(resonance(me, { orbit: "light", values: [] }), 48 + 6);
    assert.equal(resonance(me, { orbit: "depth", values: [] }), 48 + 26);
    assert.equal(resonance(me, { orbit: "light", values: ["Humor"] }), 48 + 14 + 6);
    assert.equal(resonance(me, { orbit: "depth", values: ["Humor", "Mut"] }), 48 + 14 + 26);
  });

  it("is clamped to 46–96", () => {
    assert.equal(resonance(me, { orbit: "depth", values: ["Neugier", "Humor", "Ruhe"] }), RESONANCE.max);
    const parts = resonanceParts(me, { orbit: "depth", values: ["Neugier", "Humor", "Ruhe"] });
    assert.equal(parts.raw, 48 + 3 * 14 + 26);
    assert.deepEqual(parts.sharedValues, ["Neugier", "Humor", "Ruhe"]);
    assert.equal(parts.sameOrbit, true);
  });

  it("matches the formula written in the README", () => {
    const readme = readFileSync(new URL("../../../README.md", import.meta.url), "utf8");
    const { base, perValue, sameOrbit, otherOrbit, min, max } = RESONANCE;
    assert.ok(
      readme.includes(`Resonanz = ${base} + ${perValue} × (gemeinsame Werte) + (gleicher Orbit ? ${sameOrbit} : ${otherOrbit}), begrenzt auf ${min}–${max}`),
      "README formula is out of sync with RESONANCE in data.ts",
    );
  });
});

describe("prompt questions", () => {
  it("skips the question that is already used", () => {
    const next = nextQuestion(PROMPT_BANK[0], PROMPT_BANK[1]);
    assert.equal(next, PROMPT_BANK[2]);
  });
});

describe("word filter", () => {
  it("normalises case, leetspeak, accents and stretched letters", () => {
    assert.equal(normalizeForFilter("HUUUURE!!"), "hure");
    assert.equal(normalizeForFilter("Gr\u00fc\u00dfe"), "gruesse");
    assert.equal(normalizeForFilter("h0r3"), "hore");
  });

  it("blocks listed words and phrases in their disguised forms", () => {
    for (const text of ["Du Hure", "h u r e", "SCHLAAAMPE", "fick dich", "F1ck dich!", "kys", "send nudes pls", "Hurensöhne"]) {
      assert.equal(isObjectionable(text), true, text);
    }
  });

  it("lets ordinary text through (whole words only)", () => {
    for (const text of [
      "",
      "Ich liebe Trauben und grape juice",
      "Wir könnten am Wochenende in die Mongolei",
      "Ich arbeite mit MongoDB",
      "Spice Girls im Auto, laut",
      "Schifffahrt auf der Donau",
      "Ich bin 25 und wohne in Wien",
      "Ich habe 1 Katze und 3 Pflanzen",
    ]) {
      assert.equal(isObjectionable(text), false, text);
    }
  });
});
