// Before VELA+ is sold in the iOS/Android app (RevenueCat), the Datenschutz
// page must name RevenueCat and the stores, and the AGB must explain store
// billing, auto-renewal, cancellation in the store and restoring purchases
// (Apple 3.1.2, Google Play subscription policy).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\s+/g, " ");

describe("legal texts for in-app purchases", () => {
  it("Datenschutz names RevenueCat as processor, the stores and the US transfer basis", () => {
    const page = read("../../routes/datenschutz.tsx");
    assert.match(page, /RevenueCat, Inc\./);
    assert.match(page, /Auftragsverarbeiter \(Art\. 28 DSGVO\)/);
    assert.match(page, /Standardvertragsklauseln/);
    assert.match(page, /App Store/);
    assert.match(page, /Google Play/);
  });

  it("AGB explain store billing, renewal, cancellation 24 h before, refunds and restore", () => {
    const page = read("../../routes/agb.tsx");
    assert.match(page, /Apple-Konto \(App Store\)/);
    assert.match(page, /verlängert sich automatisch/);
    assert.match(page, /mindestens 24 Stunden vor Ende/);
    assert.match(page, /Käufe wiederherstellen/);
    assert.match(page, /Erstattung laufen dann über sie/);
    assert.match(page, /Website laufen weiterhin über Stripe/);
  });
});
