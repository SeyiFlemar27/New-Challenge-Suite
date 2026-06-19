import { Card, LinkButton } from "@/components/ui";

export default function CheckoutCancelPage() {
  return <main className="flex min-h-screen items-center justify-center bg-black"><Card className="p-10 text-center"><h1 className="text-3xl font-black">Checkout Cancelled</h1><p className="mt-4 text-slate-300">No subscription changes were made.</p><LinkButton href="/subscriptions" className="mt-8">Choose a Plan</LinkButton></Card></main>;
}
