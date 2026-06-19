"use client";

import { useState } from "react";
import { legalDocuments } from "@/lib/legal";
import type { AgreementType } from "@/lib/types";
import { Button, Card } from "./ui";

export function ConsentDialog({
  agreementType,
  targetId,
  actionLabel,
  onAccepted
}: {
  agreementType: AgreementType;
  targetId?: string;
  actionLabel: string;
  onAccepted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const doc = legalDocuments[agreementType];

  async function accept() {
    await fetch("/api/compliance/consents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agreementType, agreementVersion: doc.version, targetId })
    }).catch(() => null);
    setOpen(false);
    setAccepted(false);
    onAccepted();
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>{actionLabel}</Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
          <Card className="max-w-2xl p-7">
            <h2 className="text-2xl font-black text-[var(--gold)]">{doc.title}</h2>
            <p className="mt-1 text-sm text-slate-400">Version {doc.version}</p>
            <p className="mt-5 leading-7 text-slate-200">{doc.body}</p>
            <label className="mt-6 flex items-start gap-3 text-sm text-white">
              <input className="mt-1" type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
              <span>I have read and accept this agreement. I understand this consent will be logged with timestamp, IP address, device information, and region.</span>
            </label>
            <div className="mt-7 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button disabled={!accepted} onClick={accept}>Accept & Continue</Button>
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}
