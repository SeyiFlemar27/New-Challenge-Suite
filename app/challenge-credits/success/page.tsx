import { AppShell } from "@/components/app-shell";
import { Card, LinkButton, PageTitle } from "@/components/ui";
import { Clock3 } from "lucide-react";

export default function ChallengeCreditSuccessPage() {
  return <AppShell><PageTitle title="Payment received" subtitle="Challenge Credit confirmation" icon={<Clock3/>}/><Card className="mt-7 max-w-2xl p-7"><h2 className="text-2xl font-black">Confirmation is processing</h2><p className="mt-4 leading-7 text-slate-600">Your Challenge Credits become available only after Challenge Suite receives verified payment confirmation from Stripe. This page does not add credits to your wallet.</p><LinkButton href="/challenge-credits" className="mt-6">Check Credit Wallet</LinkButton></Card></AppShell>;
}
