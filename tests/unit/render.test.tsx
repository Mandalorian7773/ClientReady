// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ReportView } from "@/app/report/[id]/report-view";
import { finalizeReport } from "@/lib/coach/report";
import { CATEGORIES } from "@/lib/coach/rubric";
import { initialClientState } from "@/lib/sim/state";
import type { SavedSession } from "@/lib/client/storage";
import { scenario, turn } from "../helpers/fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" }));

afterEach(cleanup);

const XSS = `<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>`;

describe("safe rendering of model-generated text", () => {
  it("renders hostile strings from the model and transcript as inert text", () => {
    const turns = [turn(0, "Hello"), turn(1, `I said ${XSS}`)];
    const state = initialClientState(scenario);
    const report = finalizeReport(
      {
        summary: `Summary ${XSS}`,
        categories: CATEGORIES.map((c) => ({ id: c.id, observed: true, score: 60, rationale: XSS, evidence: [{ turn: 1, quote: XSS }] })),
        strengths: [],
        issues: [
          { title: XSS, category: "value", turn: 1, quote: XSS, whatWasMissing: XSS, whyItMattered: XSS, betterResponse: XSS, whyBetterWorks: XSS, principleId: "spin", exercise: XSS },
        ],
        plan: [{ title: XSS, why: XSS, exercise: XSS, successMetric: XSS }],
        languageBridge: [],
        deliveryNotes: [XSS],
        proposalSteps: [XSS],
        nextDrill: XSS,
        spoken: [],
      },
      turns,
      state,
      { generatedBy: "test", isDemo: false },
    );
    const session: SavedSession = { id: "s_x", createdAt: Date.now(), scenario, turns, clientState: state, report, generatedBy: "test", isDemo: false };
    const { container } = render(<ReportView session={session} onUpdate={() => {}} />);

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    expect(screen.getAllByText(/onerror=/).length).toBeGreaterThan(0);
  });

  it("shows a clear demo-engine label on demo reports", () => {
    const turns = [turn(0, "Hello"), turn(1, "Hi")];
    const state = initialClientState(scenario);
    const report = finalizeReport(
      { summary: "s", categories: [], strengths: [], issues: [], plan: [], languageBridge: [], deliveryNotes: [], proposalSteps: [], nextDrill: "", spoken: [] },
      turns,
      state,
      { generatedBy: "Demo engine (rule-based, not an LLM)", isDemo: true },
    );
    render(<ReportView session={{ id: "s_y", createdAt: 0, scenario, turns, clientState: state, report, generatedBy: "", isDemo: true }} onUpdate={() => {}} />);
    expect(screen.getByText("Demo engine report")).toBeTruthy();
  });
});
