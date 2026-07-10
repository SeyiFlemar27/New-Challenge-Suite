"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, Card, LinkButton, PageTitle } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { ShieldCheck } from "lucide-react";

type Kyc = Record<string, unknown> & { kycStatus?: string; kycRequired?: boolean; providerConfigured?: boolean };

export default function KycStatusPage() {
  const [kyc, setKyc] = useState<Kyc | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    apiRequest<{ kyc: Kyc }>("/api/kyc").then((result) => {
      if (result.ok) setKyc(result.data?.kyc ?? null);
      else setMessage(result.message);
    });
  }, []);
  async function start() {
    const result = await apiRequest<{ kyc: Kyc }>("/api/kyc", { method: "POST", body: JSON.stringify({ action: "start" }) });
    setMessage(result.message);
    if (result.ok) setKyc(result.data?.kyc ?? null);
  }
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <PageTitle title="Premium Verification" subtitle="Premium tools may require identity verification through a real KYC provider before full access unlocks." icon={<ShieldCheck />} />
        <Card className="mt-8 p-6 sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">{kyc?.kycRequired ? "Premium Pending KYC" : "KYC Not Required"}</p>
          <h2 className="mt-3 text-2xl font-black">Status: {String(kyc?.kycStatus ?? "loading").replaceAll("_", " ")}</h2>
          <p className="mt-4 leading-7 text-slate-300">Challenge Suite stores only provider metadata such as status, provider, session ID, and timestamps. Raw government ID images, passports, driver licenses, national IDs, face scans, and liveness media are not stored in Firebase.</p>
          <p className="mt-4 rounded-[8px] border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-yellow-100">{message || (kyc?.providerConfigured === false ? "KYC provider not configured yet." : "Verification access remains provider-controlled.")}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button onClick={start}>Start Verification</Button>
            <LinkButton href="/dashboard" variant="secondary">Back to Dashboard</LinkButton>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
