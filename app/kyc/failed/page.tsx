import { AppShell } from "@/components/app-shell";
import { Card, LinkButton } from "@/components/ui";
import { ShieldCheck } from "lucide-react";

export default function KycFailedPage() {
  return <AppShell><Card className="mx-auto mt-10 max-w-2xl p-8 text-center"><ShieldCheck className="mx-auto h-12 w-12 text-[var(--gold)]" /><h1 className="mt-5 text-3xl font-black">Verification Needs Attention</h1><p className="mt-3 text-slate-300">If a provider rejects or expires verification later, only safe metadata will be stored. Raw ID and face media remain outside Firebase.</p><LinkButton href="/kyc/status" className="mt-6">Review KYC Status</LinkButton></Card></AppShell>;
}
