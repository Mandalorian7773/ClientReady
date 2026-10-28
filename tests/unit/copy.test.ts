import { describe, expect, it } from "vitest";
import { offerPhrase } from "@/lib/scenario/copy";
import { PRESETS } from "@/lib/scenario/presets";

describe("offerPhrase", () => {
  it("lowercases title-case words but keeps acronyms and brands", () => {
    expect(offerPhrase("AI Receptionist")).toBe("AI receptionist");
    expect(offerPhrase("Conversion-focused website redesign")).toBe("conversion-focused website redesign");
    expect(offerPhrase("Shopify Store Speed & checkout optimisation")).toBe("Shopify store speed & checkout optimisation");
    expect(offerPhrase("CRM Setup for WordPress")).toBe("CRM setup for WordPress");
  });

  it("produces a readable phrase for every preset", () => {
    for (const p of PRESETS) expect(offerPhrase(p.scenario.offer.name)).not.toMatch(/^\s*$/);
  });
});
