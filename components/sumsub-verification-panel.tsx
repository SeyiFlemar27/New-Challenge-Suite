"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card, LinkButton } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { Loader2, ShieldCheck, TriangleAlert } from "lucide-react";

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
  const [sdkReady, setSdkReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const currentToken = useRef<string | null>(null);

  useEffect(() => {
    if (!initialKyc) {
      apiRequest<{ kyc: Kyc }>("/api/kyc/sumsub/status").then((result) => {
        if (result.ok) setKyc(result.data?.kyc ?? null);
        else setMessage("Sign in to start identity verification.");
      });
    }
  }, [initialKyc]);

  async function startSession() {
    setLoading(true);
    setSdkReady(false);
    setUnavailable(false);
    setMessage("Preparing secure verification. This usually takes a few seconds.");
    const result = await apiRequest<SumsubStart>("/api/kyc/sumsub/start", { method: "POST", body: JSON.stringify({ action: "start" }) });
    if (result.data?.kyc) setKyc(result.data.kyc);
    if (!result.ok || !result.data?.accessToken) {
      setLoading(false);
      setUnavailable(true);
      setMessage(result.data?.notRequired ? "Verification is not required for your current plan." : "Verification is temporarily unavailable. We could not connect to the verification provider right now. Please try again shortly.");
      return;
    }
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
      sdk.on("idCheck.onApplicantStatusChanged", () => {
        setMessage("Verification status updated. Final approval is sent by Sumsub after review.");
        void apiRequest<{ kyc: Kyc }>("/api/kyc/sumsub/status").then((status) => status.ok && setKyc(status.data?.kyc ?? null));
      });
      sdk.on("idCheck.onApplicantSubmitted", () => setMessage("Verification submitted. Sumsub review is pending."));
      sdk.on("idCheck.onError", () => {
        setUnavailable(true);
        setMessage("Verification is temporarily unavailable. Please try again shortly.");
      });
      setLaunched(true);
      setSdkReady(true);
      setLoading(false);
      setMessage("Secure verification is ready. Complete the steps in the verification window.");
      sdk.build().launch("#sumsub-websdk-container");
    } catch {
      setLoading(false);
      setUnavailable(true);
      setMessage("Verification is temporarily unavailable. We could not connect to the verification provider right now. Please try again shortly.");
    }
  }

  const required = kyc?.kycRequired === true;
  const configured = kyc?.providerConfigured !== false && !["provider_not_configured", "provider_error"].includes(String(kyc?.kycStatus ?? ""));

  return (
    <div className="space-y-5">
      <Card className="p-6 sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Secure Sumsub check</p>
        <h2 className="mt-3 text-2xl font-black">Continue to secure verification</h2>
        <p className="mt-4 leading-7 text-slate-300">Sumsub handles the government ID, selfie, and liveness flow. Challenge Suite stores only verification status and provider metadata.</p>
        {!configured ? <div className="mt-5 rounded-[8px] border border-yellow-500/25 bg-yellow-500/10 p-4 text-sm text-yellow-100"><TriangleAlert className="mb-2" />Verification is temporarily unavailable. Please try again shortly.</div> : null}
        {message ? <p className="mt-5 rounded-[8px] border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-200">{message}</p> : null}
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {required ? <Button onClick={startSession} disabled={loading || !configured}>{loading ? <><Loader2 className="animate-spin" size={17} /> Preparing secure verification</> : launched ? "Restart Verification" : "Continue to secure verification"}</Button> : <LinkButton href="/dashboard">Back to Dashboard</LinkButton>}
          <LinkButton href="/kyc/status" variant="secondary">View Status</LinkButton>
          {unavailable ? <LinkButton href="/contact" variant="ghost">Contact Support</LinkButton> : null}
        </div>
      </Card>
      {loading ? <Card className="p-6 sm:p-8"><div className="flex items-center gap-4"><Loader2 className="animate-spin text-[var(--gold)]" /><div><h3 className="font-black">Preparing secure verification</h3><p className="mt-1 text-sm text-slate-400">This usually takes a few seconds.</p></div></div><div className="mt-5 h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full w-2/3 animate-pulse rounded-full bg-[var(--gold)]" /></div></Card> : null}
      {required && configured && sdkReady ? <Card className="overflow-hidden p-4 sm:p-6"><div id="sumsub-websdk-container" className="min-h-[420px] rounded-[8px] border border-white/10 bg-black/40" /></Card> : null}
      <Card className="p-5 text-sm leading-6 text-slate-400"><ShieldCheck className="mb-3 text-[var(--gold)]" />Verification unlocks premium-sensitive tools only after Sumsub sends a trusted pass result. Free/basic features remain available while review is pending.</Card>
    </div>
  );
}
