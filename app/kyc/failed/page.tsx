import { AppShell } from "@/components/app-shell";
import { Card, LinkButton } from "@/components/ui";
import { ShieldCheck } from "lucide-react";

export default function KycFailedPage() {
  return <AppShell><Card className="mx-auto mt-10 max-w-2xl p-8 text-center"><ShieldCheck className="mx-auto h-12 w-12 text-[var(--gold)]" /><h1 className="mt-5 text-3xl font-black">Verification Needs Attention</h1><p className="mt-3 text-slate-300">If Sumsub rejects or requests more information, Challenge Suite stores only safe status metadata and review labels. Raw ID and face media remain outside Firebase.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><LinkButton href="/kyc/start">Resubmit Verification</LinkButton><LinkButton href="/kyc/status" variant="secondary">Review KYC Status</LinkButton></div></Card></AppShell>;
}
