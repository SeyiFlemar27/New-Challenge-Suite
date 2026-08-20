import { BellOff } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, LinkButton } from "@/components/ui";

export default function NotificationTargetUnavailablePage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-2xl py-12">
        <Card className="p-8 text-center">
          <BellOff className="mx-auto text-[var(--gold)]" aria-hidden="true" />
          <h1 className="mt-5 text-2xl font-black">This item is no longer available</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-400">It may have been removed, cancelled, or you may no longer have access to it.</p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <LinkButton href="/notifications">Back to Notifications</LinkButton>
            <LinkButton href="/explore" variant="secondary">View Challenges</LinkButton>
            <LinkButton href="/dashboard" variant="secondary">Back to Dashboard</LinkButton>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
