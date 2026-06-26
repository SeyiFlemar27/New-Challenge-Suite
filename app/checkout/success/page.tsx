import { Card, LinkButton } from "@/components/ui";

export default function CheckoutSuccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6">
      <Card className="max-w-xl p-10 text-center">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-slate-400">Stripe checkout</p>
        <h1 className="mt-3 text-3xl font-black text-[var(--gold)]">Checkout received</h1>
        <p className="mt-4 text-slate-300">Payment confirmation is pending. This page does not activate subscriptions or credit DoroCoins by itself.</p>
        <p className="mt-3 text-sm text-slate-400">Your account updates only after Challenge Suite receives and verifies the Stripe webhook confirmation.</p>
        <LinkButton href="/dashboard" className="mt-8">Return to Dashboard</LinkButton>
      </Card>
    </main>
  );
}
