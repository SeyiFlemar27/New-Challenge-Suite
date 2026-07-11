"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card, LinkButton } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { ShieldCheck, TriangleAlert } from "lucide-react";

type Kyc = Record<string, unknown> & { kycStatus?: string; kycRequired?: boolean; providerConfigured?: boolean; premiumAccessState?: string };
type SumsubStart = { accessToken?: string; applicantId?: string; levelName?: string; expiresAt?: string; kyc?: Kyc; providerConfigured?: boolean; notRequired?: boolean };

declare global {
  interface Window {
    snsWebSdk?: {
      init: (token: string, refresh: () => Promise<string>) => {
        withConf: (config: Record<string, unknown>) => unknown;
        withOptions: (options: Record<string, unknown>) => unknown;
        on: (event: string, handler: (...args: unknown[]) => void) => unknown;
        build: () => { launch: (selector: string) => void };
      };
    };
  }
}

function loadSumsubScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.snsWebSdk) return resolve();
    const existing = document.querySelector<HTMLScriptElement>('script[data-sumsub-websdk="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("SUMSUB_SCRIPT_FAILED")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://static.sumsub.com/idensic/static/sns-websdk-builder.js";
    script.async = true;
    script.dataset.sumsubWebsdk = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("SUMSUB_SCRIPT_FAILED"));
    document.head.appendChild(script);
  });
}

export function SumsubVerificationPanel({ initialKyc }: { initialKyc?: Kyc | null }) {
  const [kyc, setKyc] = useState<Kyc | null>(initialKyc ?? null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [launched, setLaunched] = useState(false);
  const currentToken = useRef<string | null>(null);

  useEffect(() => {
    if (!initialKyc) {
      apiRequest<{ kyc: Kyc }>("/api/kyc/sumsub/status").then((result) => {
        if (result.ok) setKyc(result.data?.kyc ?? null);
        else setMessage(result.message);
      });
    }
  }, [initialKyc]);

  async function startSession() {
    setLoading(true);
    setMessage("");
    const result = await apiRequest<SumsubStart>("/api/kyc/sumsub/start", { method: "POST", body: JSON.stringify({ action: "start" }) });
    setLoading(false);
    setMessage(result.message);
    if (result.data?.kyc) setKyc(result.data.kyc);
    if (!result.ok || !result.data?.accessToken) return;
    currentToken.current = result.data.accessToken;
    try {
      await loadSumsubScript();
      if (!window.snsWebSdk) throw new Error("SUMSUB_WEBSDK_UNAVAILABLE");
      const sdk = window.snsWebSdk
        .init(result.data.accessToken, async () => {
          const refreshed = await apiRequest<SumsubStart>("/api/kyc/sumsub/start", { method: "POST", body: JSON.stringify({ action: "refresh" }) });
          if (!refreshed.ok || !refreshed.data?.accessToken) throw new Error("TOKEN_REFRESH_FAILED");
          currentToken.current = refreshed.data.accessToken;
          return refreshed.data.accessToken;
        })
        .withConf({ lang: "en", email: undefined }) as any;
      sdk.withOptions({ addViewportTag: false, adaptIframeHeight: true });
      sdk.on("idCheck.onApplicantStatusChanged", (_payload: unknown) => {
        setMessage("Verification status updated. Final approval is sent by Sumsub webhook after review.");
        void apiRequest<{ kyc: Kyc }>("/api/kyc/sumsub/status").then((status) => status.ok && setKyc(status.data?.kyc ?? null));
      });
      sdk.on("idCheck.onApplicantSubmitted", () => setMessage("Verification submitted. Sumsub review is pending."));
      sdk.on("idCheck.onError", () => setMessage("Sumsub verification encountered an error. Please retry."));
      sdk.build().launch("#sumsub-websdk-container");
      setLaunched(true);
    } catch {
      setMessage("KYC provider could not be opened. Please try again or contact support.");
    }
  }

  const status = String(kyc?.kycStatus ?? "loading").replaceAll("_", " ");
  const required = kyc?.kycRequired === true;
  const configured = kyc?.providerConfigured !== false && kyc?.kycStatus !== "provider_not_configured";

  return (
    <div className="space-y-6">
      <Card className="p-6 sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">{required ? "Premium Pending KYC" : "KYC Not Required"}</p>
        <h2 className="mt-3 text-2xl font-black capitalize">Status: {status}</h2>
        <p className="mt-4 leading-7 text-slate-300">Challenge Suite uses Sumsub for government ID, driver license, national ID, passport where enabled, selfie, face, and liveness checks. Challenge Suite stores only provider metadata and status. Raw ID documents and face media are not stored in Firebase.</p>
        {!configured ? <div className="mt-5 rounded-[8px] border border-yellow-500/25 bg-yellow-500/10 p-4 text-sm text-yellow-100"><TriangleAlert className="mb-2" />KYC provider is not configured yet.</div> : null}
        {message ? <p className="mt-5 rounded-[8px] border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-200">{message}</p> : null}
        <div className="mt-7 flex flex-wrap gap-3">
          {required ? <Button onClick={startSession} disabled={loading || !configured}>{loading ? "Starting Verification..." : launched ? "Restart Verification" : "Start Verification"}</Button> : <LinkButton href="/dashboard">Back to Dashboard</LinkButton>}
          <LinkButton href="/kyc/status" variant="secondary">View Status</LinkButton>
        </div>
      </Card>
      {required && configured ? <Card className="overflow-hidden p-4 sm:p-6"><div id="sumsub-websdk-container" className="min-h-[360px] rounded-[8px] border border-white/10 bg-black/40" /></Card> : null}
      <Card className="p-5 text-sm leading-6 text-slate-400"><ShieldCheck className="mb-3 text-[var(--gold)]" />Verification unlocks premium-sensitive tools only after Sumsub sends a trusted pass result. Free/basic features remain available while review is pending.</Card>
    </div>
  );
}
