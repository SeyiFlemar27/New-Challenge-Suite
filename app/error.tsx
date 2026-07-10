"use client";

import { BrandLogo } from "@/components/brand";
import { Button, LinkButton } from "@/components/ui";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="flex min-h-screen items-center justify-center bg-black px-5 text-white"><div className="w-full max-w-xl text-center"><BrandLogo imageClassName="mx-auto h-20 w-20 border-2 border-[var(--gold)]" /><p className="mt-8 text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">Something went wrong</p><h1 className="mt-4 text-4xl font-black sm:text-5xl">We could not load this view.</h1><p className="mt-5 leading-7 text-slate-400">Try the request again. No payment, credit, or competition action is completed by this error page.</p><div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><Button onClick={reset}>Try Again</Button><LinkButton href="/landing" variant="secondary">Return Home</LinkButton></div></div></main>;
}
