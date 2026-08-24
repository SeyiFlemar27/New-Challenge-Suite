"use client";

import { Check, ChevronDown, Circle, LockKeyhole, X } from "lucide-react";
import { Button } from "@/components/ui";

export type BuilderGuideContent = {
  title: string;
  description: string;
  points: readonly string[];
};

export function ChallengeBuilderFrame({
  steps,
  currentStep,
  unlockedStep,
  guide,
  guideOpen,
  setGuideOpen,
  onStepChange,
  children
}: {
  steps: readonly string[];
  currentStep: number;
  unlockedStep: number;
  guide: BuilderGuideContent;
  guideOpen: boolean;
  setGuideOpen: (open: boolean) => void;
  onStepChange: (step: number) => void;
  children: React.ReactNode;
}) {
  return <>
    <div className="mt-8 grid min-w-0 gap-8 lg:grid-cols-[270px_minmax(0,1fr)] xl:grid-cols-[270px_minmax(0,760px)_280px] 2xl:grid-cols-[290px_minmax(0,840px)_300px]">
      <BuilderRail steps={steps} currentStep={currentStep} unlockedStep={unlockedStep} onStepChange={onStepChange} />
      <section className="min-w-0">
        <div className="mb-5 lg:hidden">
          <label className="block text-xs font-black uppercase tracking-[0.14em] text-slate-500" htmlFor="advanced-builder-mobile-step">Step {currentStep + 1} of {steps.length}</label>
          <select id="advanced-builder-mobile-step" value={currentStep} onChange={(event) => onStepChange(Number(event.target.value))} className="mt-2 min-h-12 w-full rounded-[8px] border border-black/10 bg-white px-3 font-bold text-slate-950">
            {steps.map((label, index) => <option key={label} value={index} disabled={index > unlockedStep}>{index + 1}. {label}</option>)}
          </select>
        </div>
        {children}
        <button type="button" onClick={() => setGuideOpen(true)} className="mt-4 flex min-h-11 w-full items-center justify-between rounded-[8px] border border-black/10 bg-white px-4 text-sm font-black text-slate-950 xl:hidden">
          Builder Guide <ChevronDown size={18} />
        </button>
      </section>
      <BuilderGuide guide={guide} />
    </div>
    {guideOpen ? <BuilderGuideSheet guide={guide} close={() => setGuideOpen(false)} /> : null}
  </>;
}

export function BuilderSurface({ children }: { children: React.ReactNode }) {
  return <div data-builder-surface className="overflow-hidden rounded-[12px] border border-black/[0.08] bg-white text-slate-950 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">{children}</div>;
}

export function BuilderContent({ children }: { children: React.ReactNode }) {
  return <div className="p-5 sm:p-8 lg:p-10">{children}</div>;
}

export function BuilderFooter({
  backDisabled,
  busy,
  finishLater,
  onBack,
  onContinue,
  final,
  finalDisabled,
  submitLabel = "Submit for Review"
}: {
  backDisabled: boolean;
  busy: boolean;
  finishLater?: () => void;
  onBack: () => void;
  onContinue: () => void;
  final: boolean;
  finalDisabled?: boolean;
  submitLabel?: string;
}) {
  return <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.08] bg-white/95 px-5 py-4 backdrop-blur sm:px-8 lg:px-10">
    <Button variant="secondary" disabled={backDisabled || busy} onClick={onBack}>Back</Button>
    <div className="flex flex-wrap justify-end gap-2">
      {finishLater ? <Button variant="ghost" disabled={busy} onClick={finishLater}>Finish Later</Button> : null}
      <Button disabled={busy || Boolean(finalDisabled)} onClick={onContinue}>{busy ? final ? "Submitting..." : "Saving..." : final ? submitLabel : "Continue"}</Button>
    </div>
  </div>;
}

export function BuilderStepHeading({ title, body, eyebrow }: { title: string; body?: string; eyebrow?: string }) {
  return <div>{eyebrow ? <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-700">{eyebrow}</p> : null}<h2 className={`${eyebrow ? "mt-2" : ""} text-2xl font-black text-slate-950`}>{title}</h2>{body ? <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{body}</p> : null}</div>;
}

function BuilderRail({ steps, currentStep, unlockedStep, onStepChange }: { steps: readonly string[]; currentStep: number; unlockedStep: number; onStepChange: (step: number) => void }) {
  return <nav className="hidden lg:block" aria-label="Challenge builder steps"><ol className="sticky top-24 space-y-1">{steps.map((label, index) => {
    const locked = index > unlockedStep;
    const complete = index < currentStep;
    return <li key={label}><button type="button" disabled={locked} aria-current={currentStep === index ? "step" : undefined} onClick={() => !locked && onStepChange(index)} className={`group flex min-h-12 w-full items-center gap-3 rounded-[8px] px-3 text-left text-sm font-bold transition ${currentStep === index ? "bg-amber-50 text-slate-950 shadow-sm" : locked ? "cursor-not-allowed text-slate-400" : "text-slate-600 hover:bg-white hover:text-slate-950"}`}><span className={`grid size-7 shrink-0 place-items-center rounded-full border ${currentStep === index ? "border-[var(--gold)] bg-[var(--gold)] text-black" : complete ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white"}`}>{locked ? <LockKeyhole size={13} /> : complete ? <Check size={14} /> : <span className="text-xs">{index + 1}</span>}</span><span className="leading-5">{label}</span></button></li>;
  })}</ol></nav>;
}

function BuilderGuide({ guide }: { guide: BuilderGuideContent }) {
  return <aside className="hidden xl:block"><div className="sticky top-24 rounded-[12px] border border-black/[0.08] bg-white p-6 shadow-[0_14px_44px_rgba(15,23,42,0.06)]"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-amber-700"><Circle size={8} fill="currentColor" /> Builder Guide</div><h2 className="mt-4 text-lg font-black text-slate-950">{guide.title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{guide.description}</p><ul className="mt-5 space-y-4">{guide.points.map((item) => <li key={item} className="flex gap-3 text-sm leading-6 text-slate-600"><Check className="mt-1 shrink-0 text-amber-700" size={16} /><span>{item}</span></li>)}</ul></div></aside>;
}

function BuilderGuideSheet({ guide, close }: { guide: BuilderGuideContent; close: () => void }) {
  return <div className="fixed inset-0 z-[100] bg-black/45 xl:hidden" role="dialog" aria-modal="true" aria-label="Builder Guide" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><div className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-[16px] bg-white p-6 text-slate-950 shadow-2xl"><div className="flex items-center justify-between"><p className="text-xs font-black uppercase tracking-[0.14em] text-amber-700">Builder Guide</p><button type="button" onClick={close} className="grid size-10 place-items-center rounded-full bg-slate-100" aria-label="Close Builder Guide"><X size={18} /></button></div><h2 className="mt-4 text-2xl font-black">{guide.title}</h2><p className="mt-2 leading-7 text-slate-600">{guide.description}</p><ul className="mt-6 space-y-4">{guide.points.map((item) => <li key={item} className="flex gap-3 text-sm leading-6 text-slate-600"><Check className="mt-1 shrink-0 text-amber-700" size={17} /><span>{item}</span></li>)}</ul></div></div>;
}
