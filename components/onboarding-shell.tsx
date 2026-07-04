import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { BrandLogo } from "@/components/brand";
import { cn } from "@/lib/utils";

interface OnboardingShellProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  currentStep: number;
  totalSteps: number;
  children: React.ReactNode;
}

export function OnboardingShell({
  eyebrow,
  title,
  subtitle,
  currentStep,
  totalSteps,
  children
}: OnboardingShellProps) {
  return (
    <main className="relative min-h-[100dvh] overflow-x-hidden bg-black px-5 py-6 text-white sm:px-8 sm:py-8 lg:px-12 lg:py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[linear-gradient(180deg,rgba(245,217,10,.08),transparent)]" />
      <div className="relative mx-auto max-w-6xl">
        <header className="flex items-center justify-between gap-4 border-b border-white/10 pb-6">
          <Link href="/landing" className="flex items-center gap-3">
            <BrandLogo imageClassName="h-11 w-11 border border-[var(--gold)]" />
            <span className="hidden text-sm font-black uppercase tracking-[0.16em] sm:block">Challenge Suite</span>
          </Link>
          <Link href="/subscriptions" className="inline-flex min-h-11 items-center gap-2 rounded-[8px] px-3 text-sm font-bold text-slate-400 transition hover:text-white">
            <ArrowLeft size={17} /> Plans
          </Link>
        </header>

        <section className="py-10 sm:py-14 lg:py-16">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
            <aside className="lg:sticky lg:top-10 lg:self-start">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[var(--gold)]">{eyebrow}</p>
              <h1 className="mt-5 max-w-xl text-4xl font-black leading-[1.04] sm:text-5xl lg:text-6xl">{title}</h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-400">{subtitle}</p>
              <div className="mt-8">
                <div className="flex items-center justify-between text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                  <span>Setup progress</span>
                  <span>{currentStep} / {totalSteps}</span>
                </div>
                <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${totalSteps}, minmax(0, 1fr))` }}>
                  {Array.from({ length: totalSteps }, (_, index) => (
                    <span
                      key={index}
                      className={cn("h-1 rounded-full bg-white/10", index < currentStep && "bg-[var(--gold)]")}
                    />
                  ))}
                </div>
              </div>
              <div className="mt-8 flex items-start gap-3 border-t border-white/10 pt-6 text-sm leading-6 text-slate-500">
                <Check className="mt-0.5 shrink-0 text-[var(--gold)]" size={17} />
                Your current competitor access remains available after setup.
              </div>
            </aside>
            <div className="min-w-0">{children}</div>
          </div>
        </section>
      </div>
    </main>
  );
}
