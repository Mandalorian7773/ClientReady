"use client";

import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui";
import { loadDraft } from "@/lib/client/storage";
import type { Scenario } from "@/lib/scenario/schema";
import { Studio } from "./studio";

export default function SessionPage() {
  const [s, setS] = useState<Scenario | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setS(loadDraft());
    setLoaded(true);
  }, []);
  if (!loaded) return null;
  if (!s) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <p className="text-fg-muted">No scenario selected.</p>
        <ButtonLink href="/practice" className="mt-4">Build a scenario</ButtonLink>
      </div>
    );
  }
  return <Studio scenario={s} />;
}
