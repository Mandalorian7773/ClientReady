"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui";
import { loadDraft } from "@/lib/client/storage";
import { SAMPLE_SCENARIO } from "@/lib/sample/sample-call";
import type { Scenario } from "@/lib/scenario/schema";
import { Studio } from "./studio";

function SessionInner() {
  const sample = useSearchParams().has("sample");
  const [s, setS] = useState<Scenario | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setS(sample ? SAMPLE_SCENARIO : loadDraft());
    setLoaded(true);
  }, [sample]);
  if (!loaded) return null;
  if (!s) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <p className="text-fg-muted">No scenario selected.</p>
        <div className="mt-4 flex justify-center gap-3">
          <ButtonLink href="/practice">Build a scenario</ButtonLink>
          <ButtonLink href="/practice/session?sample" variant="secondary">
            Play the sample call
          </ButtonLink>
        </div>
      </div>
    );
  }
  return <Studio key={sample ? "sample" : "live"} scenario={s} sample={sample} />;
}

export default function SessionPage() {
  return (
    <Suspense fallback={null}>
      <SessionInner />
    </Suspense>
  );
}
