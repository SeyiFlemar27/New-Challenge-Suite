"use client";

import { AppShell } from "@/components/app-shell";
import { PageTitle } from "@/components/ui";
import { SumsubVerificationPanel } from "@/components/sumsub-verification-panel";
import { ShieldCheck } from "lucide-react";

export default function KycStartPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <PageTitle title="Start identity verification" subtitle="Complete secure Sumsub verification to unlock premium-sensitive Challenge Suite tools after payment." icon={<ShieldCheck />} />
        <div className="mt-8"><SumsubVerificationPanel /></div>
      </div>
    </AppShell>
  );
}
