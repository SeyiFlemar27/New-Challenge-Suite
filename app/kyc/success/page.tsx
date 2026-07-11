import { AppShell } from "@/components/app-shell";
import { Card, LinkButton } from "@/components/ui";
import { ShieldCheck } from "lucide-react";

export default function KycSuccessPage() {
  return <AppShell><Card className="mx-auto mt-10 max-w-2xl p-8 text-center"><ShieldCheck className="mx-auto h-12 w-12 text-[var(--gold)]" /><h1 className="mt-5 text-3xl font-black">Verification Submitted</h1><p className="mt-3 text-slate-300">Your Sumsub session was submitted. Premium-sensitive tools unlock only after Sumsub sends a verified result to Challenge Suite.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><LinkButton href="/kyc/status">Review Status</LinkButton><LinkButton href="/dashboard" variant="secondary">Dashboard</LinkButton></div></Card></AppShell>;
}
