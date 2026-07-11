import { AppShell } from "@/components/app-shell";
import { Card, LinkButton } from "@/components/ui";
import { CircleAlert, Lightbulb } from "lucide-react";

const tips = ["Use a clear photo", "Make sure the document is not expired", "Make sure the name matches your account", "Complete the selfie check in a well-lit place"];

export default function KycFailedPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <Card className="p-8 sm:p-10">
          <CircleAlert className="h-14 w-14 text-yellow-300" />
          <h1 className="mt-5 text-4xl font-black">Verification needs attention</h1>
          <p className="mt-3 max-w-2xl text-lg leading-8 text-slate-300">Your identity verification could not be completed or needs another submission. If Sumsub provides a safe reason, it will appear on your verification status page.</p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {tips.map((tip) => <p key={tip} className="flex gap-3 rounded-[8px] border border-white/10 bg-black/30 p-4 text-sm font-bold text-slate-200"><Lightbulb className="shrink-0 text-[var(--gold)]" size={18} />{tip}</p>)}
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row"><LinkButton href="/kyc/start">Try Again</LinkButton><LinkButton href="/contact" variant="secondary">Contact Support</LinkButton><LinkButton href="/kyc/status" variant="ghost">View Status</LinkButton></div>
        </Card>
      </div>
    </AppShell>
  );
}
