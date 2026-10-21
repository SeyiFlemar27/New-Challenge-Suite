"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { BrandLogo } from "@/components/brand";
import { Button, Card } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import { useAuth } from "@/components/auth-provider";
import { getAuthenticatedDestination, requestedAccountDestination } from "@/lib/account-routing";

type AccountType = "creator" | "sponsor";
type IntroResponse = { status: "in_progress" | "complete"; step: number; accountType: AccountType | null; destination?: string };
type FlowState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; accountType: AccountType; step: number };

const screens: Record<AccountType, Array<{ title: string; description: string }>> = {
  creator: [
    { title: "Your creativity starts here.", description: "Create challenges, bring people together, and turn great ideas into experiences worth sharing." },
    { title: "Build something people want to join.", description: "Set up your challenge, define how people participate, and manage everything from one place." },
    { title: "Ready to create your first challenge?", description: "Your Creator dashboard is ready. Explore what's happening or start building your own challenge." }
  ],
  sponsor: [
    { title: "Put your brand where it matters.", description: "Connect with creators and communities through challenges that match your brand." },
    { title: "Support challenges that fit your brand.", description: "Find relevant challenges, review opportunities, and contribute to experiences worth backing." },
    { title: "Let's grow your brand's presence.", description: "Your Sponsor dashboard is ready. Start exploring challenges and find your first opportunity." }
  ]
};

export default function AccountWelcomePage() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [flow, setFlow] = useState<FlowState>({ kind: "loading" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadFlow = useCallback(async (): Promise<FlowState | { kind: "complete"; destination: string }> => {
    const result = await apiRequest<IntroResponse>("/api/onboarding/intro");
    if (!result.ok || !result.data) throw new Error(result.message || "Your onboarding could not be loaded.");
    if (result.data.status === "complete") {
      return { kind: "complete", destination: result.data.destination || (result.data.accountType === "sponsor" ? "/sponsor/dashboard" : "/dashboard") };
    }
    if (result.data.accountType !== "creator" && result.data.accountType !== "sponsor") {
      throw new Error("Choose Creator or Sponsor before continuing.");
    }
    return { kind: "ready", accountType: result.data.accountType, step: Math.max(0, Math.min(2, result.data.step)) };
  }, []);

  useEffect(() => {
    let active = true;
    void loadFlow().then((nextFlow) => {
      if (!active) return;
      if (nextFlow.kind === "complete") router.replace(nextFlow.destination);
      else setFlow(nextFlow);
    }).catch((caught: unknown) => {
      if (active) setFlow({ kind: "error", message: caught instanceof Error ? caught.message : "Your onboarding could not be loaded." });
    });
    return () => { active = false; };
  }, [loadFlow, router]);

  useEffect(() => {
    if (flow.kind === "ready") titleRef.current?.focus();
  }, [flow]);

  async function saveStep(step: number) {
    if (flow.kind !== "ready" || saving) return;
    setSaving(true);
    setError("");
    try {
      const result = await apiRequest<IntroResponse>("/api/onboarding/intro", { method: "PATCH", body: JSON.stringify({ step }) });
      if (!result.ok || !result.data) throw new Error(result.message || "Your progress could not be saved.");
      setFlow({ kind: "ready", accountType: flow.accountType, step: result.data.step });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your progress could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function finish() {
    if (flow.kind !== "ready" || saving || flow.step !== 2) return;
    setSaving(true);
    setError("");
    try {
      const result = await apiRequest<IntroResponse>("/api/onboarding/intro", { method: "PATCH", body: JSON.stringify({ complete: true }) });
      if (!result.ok || !result.data) throw new Error(result.message || "Your onboarding could not be completed.");
      window.dispatchEvent(new Event("challenge-suite-profile-updated"));
      const profile = await refreshProfile();
      if (!profile) throw new Error("Your introduction was saved, but account access could not be refreshed. Please try again.");
      router.replace(getAuthenticatedDestination(profile, requestedAccountDestination(window.location.search)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your onboarding could not be completed.");
      setSaving(false);
    }
  }

  if (flow.kind === "loading") return <main className="auth-shell theme-workspace grid min-h-[100dvh] place-items-center bg-[var(--background)] px-5 text-[var(--foreground)]"><Card className="w-full max-w-xl p-8"><p role="status">Preparing your Challenge Suite introduction…</p></Card></main>;
  if (flow.kind === "error") return <main className="auth-shell theme-workspace grid min-h-[100dvh] place-items-center bg-[var(--background)] px-5 text-[var(--foreground)]"><Card className="w-full max-w-xl p-8"><BrandLogo imageClassName="h-12 w-12" /><h1 className="mt-6 text-2xl font-black">We couldn&apos;t load onboarding</h1><p role="alert" className="mt-3 text-sm leading-6 text-red-700">{flow.message}</p><div className="mt-6 flex flex-wrap gap-3"><Button onClick={() => { setFlow({ kind: "loading" }); void loadFlow().then((nextFlow) => { if (nextFlow.kind === "complete") router.replace(nextFlow.destination); else setFlow(nextFlow); }).catch((caught: unknown) => setFlow({ kind: "error", message: caught instanceof Error ? caught.message : "Your onboarding could not be loaded." })); }}>Try again</Button><Button variant="secondary" onClick={() => router.replace("/auth/login")}>Sign in again</Button></div></Card></main>;

  const slide = screens[flow.accountType][flow.step];
  const final = flow.step === 2;
  return (
    <main className="auth-shell theme-workspace grid min-h-[100dvh] place-items-center bg-[var(--background)] px-5 py-8 text-[var(--foreground)] sm:px-8">
      <div className="w-full max-w-2xl">
        <header className="flex justify-center"><BrandLogo imageClassName="h-14 w-14 border border-[var(--gold)]" /></header>
        <Card className="mt-8 p-6 sm:p-10">
          <p className="text-center text-xs font-black uppercase tracking-[0.18em] text-[var(--gold-strong)]">{flow.accountType === "creator" ? "Creator" : "Sponsor"} introduction</p>
          <ol className="mt-7 grid grid-cols-3 gap-3" aria-label={`Onboarding progress: screen ${flow.step + 1} of 3`}>
            {screens[flow.accountType].map((item, index) => <li key={item.title} aria-current={index === flow.step ? "step" : undefined} className={`h-1.5 rounded-full ${index <= flow.step ? "bg-[var(--gold-strong)]" : "bg-[var(--panel-3)]"}`} />)}
          </ol>
          <p className="mt-3 text-center text-xs font-bold text-[var(--muted)]">Screen {flow.step + 1} of 3</p>
          <section className="min-h-64 py-10 text-center sm:py-14" aria-live="polite">
            <h1 ref={titleRef} tabIndex={-1} className="text-3xl font-black leading-tight outline-none sm:text-4xl">{slide.title}</h1>
            <p className="mx-auto mt-5 max-w-lg text-base leading-7 text-[var(--muted)] sm:text-lg">{slide.description}</p>
            {final ? <div className="mx-auto mt-7 flex w-fit items-center gap-2 rounded-full border border-emerald-700/20 bg-emerald-700/5 px-4 py-2 text-sm font-bold text-emerald-800"><CheckCircle2 size={17} /> Your dashboard is ready</div> : null}
          </section>
          {error ? <p role="alert" className="mb-4 rounded-[8px] border border-red-700/20 bg-red-700/5 p-3 text-sm text-red-800">{error}</p> : null}
          <footer className="flex flex-col-reverse gap-3 border-t border-[var(--line)] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="secondary" disabled={flow.step === 0 || saving} onClick={() => void saveStep(flow.step - 1)}><ArrowLeft size={17} /> Back</Button>
            {final
              ? <Button disabled={saving} onClick={() => void finish()}>{saving ? "Saving…" : `Open ${flow.accountType === "creator" ? "Creator" : "Sponsor"} dashboard`} <ArrowRight size={17} /></Button>
              : <Button disabled={saving} onClick={() => void saveStep(flow.step + 1)}>{saving ? "Saving…" : "Continue"} <ArrowRight size={17} /></Button>}
          </footer>
        </Card>
      </div>
    </main>
  );
}
