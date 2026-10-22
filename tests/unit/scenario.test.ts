import { describe, expect, it } from "vitest";
import { parseScenario, safeParseScenario } from "@/lib/scenario/schema";
import { PRESETS, getPreset } from "@/lib/scenario/presets";
import { LANGUAGES } from "@/lib/languages";

describe("scenario schema", () => {
  it("fills every field with defaults from an empty object", () => {
    const s = parseScenario({});
    expect(s.learner.speechLanguage).toBe("en");
    expect(s.offer.price).toBeGreaterThan(0);
    expect(s.client.country).toBe("US");
    expect(s.settings.maxTurns).toBe(10);
  });

  it("accepts partial sections and keeps provided values", () => {
    const s = parseScenario({ offer: { name: "Website", price: "1500" }, settings: { difficulty: "expert" } });
    expect(s.offer.name).toBe("Website");
    expect(s.offer.price).toBe(1500);
    expect(s.offer.currency).toBe("USD");
    expect(s.settings.difficulty).toBe("expert");
    expect(s.settings.focus).toBe("pitch");
  });

  it("rejects out-of-range and unknown enum values", () => {
    expect(safeParseScenario({ settings: { maxTurns: 99 } }).success).toBe(false);
    expect(safeParseScenario({ client: { country: "Atlantis" } }).success).toBe(false);
    expect(safeParseScenario({ offer: { price: -5 } }).success).toBe(false);
    expect(safeParseScenario({ learner: { speechLanguage: "fr" } }).success).toBe(false);
  });

  it("bounds free-text length to keep prompts small", () => {
    expect(safeParseScenario({ offer: { description: "x".repeat(601) } }).success).toBe(false);
    expect(safeParseScenario({ client: { name: "y".repeat(61) } }).success).toBe(false);
  });

  it("trims whitespace", () => {
    expect(parseScenario({ offer: { name: "  AI Bot  " } }).offer.name).toBe("AI Bot");
  });
});

describe("presets", () => {
  it("ships at least the four required scenarios, all valid", () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(4);
    for (const id of ["ai-receptionist-clinic", "website-redesign-uk", "ai-automation-startup", "consulting-negotiation"]) {
      const p = getPreset(id);
      expect(p, id).toBeDefined();
      expect(safeParseScenario(p!.scenario).success).toBe(true);
      expect(p!.scenario.id).toBe(id);
    }
  });

  it("uses only languages from the verified Gnani support matrix", () => {
    const ids = LANGUAGES.map((l) => l.id);
    for (const p of PRESETS) {
      expect(ids).toContain(p.scenario.learner.speechLanguage);
      expect(ids).toContain(p.scenario.learner.coachingLanguage);
    }
  });
});
