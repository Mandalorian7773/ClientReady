// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { deleteAllSessions, deleteSession, getSession, listSessions, loadDraft, newSessionId, saveDraft, saveSession, type SavedSession } from "@/lib/client/storage";
import { initialClientState } from "@/lib/sim/state";
import { sampleTurns, scenario } from "../helpers/fixtures";

const make = (id: string, createdAt: number): SavedSession => ({
  id, createdAt, scenario, turns: sampleTurns, clientState: initialClientState(scenario), report: null, generatedBy: "x", isDemo: false,
});

beforeEach(() => localStorage.clear());

describe("session history (localStorage)", () => {
  it("saves, lists newest first, updates in place and deletes", () => {
    saveSession(make("s_a", 1));
    saveSession(make("s_b", 2));
    expect(listSessions().map((s) => s.id)).toEqual(["s_b", "s_a"]);
    saveSession({ ...make("s_a", 1), generatedBy: "updated" });
    expect(listSessions()).toHaveLength(2);
    expect(getSession("s_a")?.generatedBy).toBe("updated");
    deleteSession("s_b");
    expect(listSessions().map((s) => s.id)).toEqual(["s_a"]);
    deleteAllSessions();
    expect(listSessions()).toEqual([]);
  });

  it("caps history at 50 sessions", () => {
    for (let i = 0; i < 60; i++) saveSession(make(`s_${i}`, i));
    expect(listSessions()).toHaveLength(50);
    expect(listSessions()[0].id).toBe("s_59");
  });

  it("survives corrupted storage", () => {
    localStorage.setItem("clientready.sessions.v1", "{broken");
    expect(listSessions()).toEqual([]);
    localStorage.setItem("clientready.draft.v1", JSON.stringify({ settings: { maxTurns: 999 } }));
    expect(loadDraft()).toBeNull();
  });

  it("round-trips a scenario draft", () => {
    saveDraft(scenario);
    expect(loadDraft()).toEqual(scenario);
  });

  it("generates ids accepted by the API", () => {
    expect(newSessionId()).toMatch(/^[a-zA-Z0-9_-]{8,64}$/);
  });
});
