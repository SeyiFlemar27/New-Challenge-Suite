"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardCheck, ExternalLink, ShieldCheck } from "lucide-react";
import { Card, LinkButton, PageTitle } from "@/components/ui";

const checks = [
  "Firestore rules published",
  "Admin account configured",
  "Normal user blocked from admin",
  "Admin dashboard counts load",
  "QA seed data created",
  "Queue cards link correctly",
  "Sensitive actions require confirmation",
  "Audit logs created",
  "Withdrawal approval blocked without KYC",
  "DoroCoins remain non-withdrawable",
  "No fake exports or notifications",
  "No money movement activated"
];
const storageKey = "challenge-suite-admin-qa-checklist-v1";

export function AdminQaChecklist() {
  const [completed, setCompleted] = useState<string[]>([]);

  useEffect(() => {
    try {
      setCompleted(JSON.parse(window.localStorage.getItem(storageKey) ?? "[]"));
    } catch {
      setCompleted([]);
    }
  }, []);

  function toggle(label: string) {
    const next = completed.includes(label) ? completed.filter((item) => item !== label) : [...completed, label];
    setCompleted(next);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  }

  return (
    <>
      <PageTitle title="Production Admin QA" subtitle="A launch checklist for access control, queue operations, auditability, withdrawal safety, and manually published Firestore rules." icon={<ClipboardCheck />} />
      <div className="mt-7 grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
        <Card className="p-5 sm:p-8">
          <div className="flex items-start gap-4"><CheckCircle2 className="mt-1 shrink-0 text-[var(--gold)]" /><div><h2 className="text-2xl font-black">Launch checklist</h2><p className="mt-2 text-sm leading-6 text-slate-400">These checkmarks are stored only in this browser. They do not alter production configuration.</p></div></div>
          <div className="mt-6 space-y-2">
            {checks.map((label) => {
              const checked = completed.includes(label);
              return <label key={label} className="flex min-h-14 cursor-pointer items-center gap-4 rounded-[8px] border border-white/10 bg-white/[0.025] px-4 py-3 transition hover:border-[var(--gold)]/30">
                <input type="checkbox" checked={checked} onChange={() => toggle(label)} className="h-5 w-5 accent-yellow-400" />
                <span className={checked ? "font-bold text-white" : "font-medium text-slate-300"}>{label}</span>
              </label>;
            })}
          </div>
        </Card>
        <div className="space-y-6">
          <Card className="border-[var(--gold)]/20 p-5 sm:p-8">
            <ShieldCheck className="text-[var(--gold)]" size={32} />
            <h2 className="mt-4 text-2xl font-black">Publish Firestore rules manually</h2>
            <ol className="mt-5 space-y-3 text-sm leading-6 text-slate-300">
              <li><strong className="text-white">1.</strong> Open Firebase Console and select <strong className="text-white">challenge-suite</strong>.</li>
              <li><strong className="text-white">2.</strong> Open Firestore Database, then Rules.</li>
              <li><strong className="text-white">3.</strong> Paste the complete local <code className="text-[var(--gold)]">firestore.rules</code> content.</li>
              <li><strong className="text-white">4.</strong> Review the diff, then select Publish.</li>
              <li><strong className="text-white">5.</strong> Verify a normal account is denied and an authorized admin succeeds through server APIs.</li>
            </ol>
            <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer" className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-[8px] border border-[var(--gold)] px-5 py-3 text-sm font-bold text-white"><ExternalLink size={16} /> Open Firebase Console</a>
          </Card>
          <Card className="p-5 sm:p-8">
            <h2 className="text-xl font-black">Operational shortcuts</h2>
            <div className="mt-5 grid gap-3">
              <LinkButton href="/admin/qa-data">Manage QA seed data</LinkButton>
              <LinkButton href="/admin/audit-logs" variant="secondary">Verify audit logs</LinkButton>
              <LinkButton href="/admin/withdrawals?status=pending_review" variant="ghost">Verify withdrawal review</LinkButton>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
