import { Suspense } from "react";
import { ScenarioBuilder } from "./scenario-builder";

export const metadata = { title: "Build your scenario" };

export default function PracticePage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-16 text-fg-muted sm:px-6">Loading…</div>}>
      <ScenarioBuilder />
    </Suspense>
  );
}
