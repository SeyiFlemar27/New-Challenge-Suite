import { AppShell } from "@/components/app-shell";
import { Card, LinkButton } from "@/components/ui";
import { ShieldCheck } from "lucide-react";

export default function KycSuccessPage() {
  return <AppShell><Card className="mx-auto mt-10 max-w-2xl p-8 text-center"><ShieldCheck className="mx-auto h-12 w-12 text-[var(--gold)]" /><h1 className="mt-5 text-3xl font-black">Verification Result Pending</h1><p className="mt-3 text-slate-300">Provider callbacks will update verified status when a real KYC provider is connected. No fake approval is performed here.</p><LinkButton href="/kyc/status" className="mt-6">View Status</LinkButton></Card></AppShell>;
}
