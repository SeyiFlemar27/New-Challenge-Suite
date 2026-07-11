"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { ShieldCheck } from "lucide-react";

type Kyc = Record<string, unknown> & { kycStatus?: string; kycRequired?: boolean; providerConfigured?: boolean; premiumAccessState?: string; kycFailureReason?: string | null; sumsubApplicantId?: string | null };

export default function KycStatusPage() {
  const [kyc, setKyc] = useState<Kyc | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    apiRequest<{ kyc: Kyc }>("/api/kyc/sumsub/status").then((result) => {
      if (result.ok) setKyc(result.data?.kyc ?? null);
      else setMessage(result.message);
    });
  }, []);
  const status = String(kyc?.kycStatus ?? "loading").replaceAll("_", " ");
  const required = kyc?.kycRequired === true;
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <PageTitle title="Premium Verification" subtitle="KYC is required only after premium payment is confirmed by Stripe webhook." icon={<ShieldCheck />} />
        <Card className="mt-8 p-6 sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">{required ? String(kyc?.premiumAccessState ?? "Premium Pending KYC").replaceAll("_", " ") : "KYC Not Required"}</p>
          <h2 className="mt-3 text-2xl font-black capitalize">Status: {status}</h2>
          <p className="mt-4 leading-7 text-slate-300">Challenge Suite stores only Sumsub metadata such as applicant ID, status, provider state, timestamps, and safe review labels. Raw government ID images, passports, driver licenses, national IDs, face scans, and liveness media are not stored in Firebase.</p>
          {kyc?.providerConfigured === false || kyc?.kycStatus === "provider_not_configured" ? <p className="mt-4 rounded-[8px] border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-yellow-100">KYC provider is not configured yet.</p> : null}
          {kyc?.kycFailureReason ? <p className="mt-4 rounded-[8px] border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-100">{String(kyc.kycFailureReason)}</p> : null}
          {message ? <p className="mt-4 rounded-[8px] border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-200">{message}</p> : null}
          <div className="mt-7 flex flex-wrap gap-3">
            {required && kyc?.kycStatus !== "verified" ? <LinkButton href="/kyc/start">Start or Resume Verification</LinkButton> : null}
            <LinkButton href="/dashboard" variant="secondary">Back to Dashboard</LinkButton>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
