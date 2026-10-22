"use client";

import { use, useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui";
import { getSession, type SavedSession } from "@/lib/client/storage";
import { ReportView } from "./report-view";

export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [session, setSession] = useState<SavedSession | null | undefined>(undefined);
  useEffect(() => {
    setSession(getSession(id) ?? null);
  }, [id]);

  if (session === undefined) return null;
  if (session === null) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <p className="text-fg-muted">This report isn&apos;t in this browser. Reports are stored locally on the device where the session happened.</p>
        <ButtonLink href="/history" className="mt-4">Go to history</ButtonLink>
      </div>
    );
  }
  return <ReportView session={session} onUpdate={setSession} />;
}
