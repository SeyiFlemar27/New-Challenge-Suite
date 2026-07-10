import Link from "next/link";
import { BrandLogo } from "@/components/brand";

export type LegalSection = { title: string; paragraphs?: string[]; bullets?: string[] };

export function LegalPage({ eyebrow, title, summary, sections }: { eyebrow: string; title: string; summary: string; sections: LegalSection[] }) {
  return (
    <main className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10 px-5 py-5">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <Link href="/landing" className="flex items-center gap-3 font-black"><BrandLogo imageClassName="h-10 w-10 border border-[var(--gold)]" /> Challenge Suite</Link>
          <Link href="/contact" className="text-sm font-bold text-[var(--gold)]">Contact</Link>
        </div>
      </header>
      <article className="mx-auto max-w-4xl px-5 py-16 sm:px-8 sm:py-24">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gold)]">{eyebrow}</p>
        <h1 className="mt-5 text-4xl font-black leading-tight sm:text-6xl">{title}</h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">{summary}</p>
        <div className="mt-10 rounded-[8px] border border-[var(--gold)]/25 bg-[var(--gold)]/5 p-5 text-sm leading-6 text-slate-300">This is a production starter policy and must be reviewed by a qualified legal professional before public launch.</div>
        <div className="mt-12 space-y-10">
          {sections.map((section) => <section key={section.title}><h2 className="text-2xl font-black">{section.title}</h2>{section.paragraphs?.map((paragraph) => <p key={paragraph} className="mt-4 leading-7 text-slate-300">{paragraph}</p>)}{section.bullets ? <ul className="mt-4 space-y-3 text-slate-300">{section.bullets.map((item) => <li key={item} className="flex gap-3"><span className="text-[var(--gold)]">•</span><span>{item}</span></li>)}</ul> : null}</section>)}
        </div>
      </article>
    </main>
  );
}
