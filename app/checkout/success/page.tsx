import { Card, LinkButton } from "@/components/ui";

export default function CheckoutSuccessPage() {
  return <main className="flex min-h-screen items-center justify-center bg-black"><Card className="p-10 text-center"><h1 className="text-3xl font-black text-[var(--gold)]">Subscription Activated</h1><p className="mt-4 text-slate-300">Stripe confirmed your checkout. Your plan will update after webhook processing.</p><LinkButton href="/dashboard" className="mt-8">Return to Dashboard</LinkButton></Card></main>;
}
