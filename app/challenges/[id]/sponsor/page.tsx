import { notFound } from "next/navigation";
import Link from "next/link";

/** Legacy Sponsor proposal route is retired. New relationships start in opportunity discovery. */
export default async function RetiredChallengeSponsorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) notFound();
  return <main className="mx-auto grid min-h-screen max-w-3xl place-items-center px-5 py-12">
    <section className="w-full rounded-xl border border-slate-200 bg-white p-7 text-center shadow-sm sm:p-10">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-800">Sponsorship opportunities</p>
      <h1 className="mt-3 text-3xl font-black text-slate-950">This proposal route is retired</h1>
      <p className="mx-auto mt-4 max-w-xl leading-7 text-slate-600">Sponsors can discover published opportunities and express interest through the Sponsor workspace. This page no longer accepts sponsor-created proposals.</p>
      <Link href="/sponsor/discover" className="mt-7 inline-flex min-h-11 items-center justify-center rounded-lg bg-amber-300 px-5 font-black text-slate-950">Discover opportunities</Link>
    </section>
  </main>;
}
