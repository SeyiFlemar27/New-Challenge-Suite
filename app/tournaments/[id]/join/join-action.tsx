"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";

type RegistrationResult = { outcome?: string; participant?: { status?: string } };

export function TournamentJoinAction({ id, status, participationMode, entryType }: {
  id: string;
  status: string;
  participationMode: string;
  entryType: string;
}) {
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [registered, setRegistered] = useState(false);

  const unavailable = status !== "registration_open" || participationMode !== "individual" || entryType !== "free";

  async function submit() {
    if (!rulesAccepted || pending || unavailable) return;
    setPending(true);
    setMessage("");
    const result = await apiRequest<RegistrationResult>(`/api/tournaments/${encodeURIComponent(id)}/join`, {
      method: "POST",
      body: JSON.stringify({ rulesAccepted: true })
    });
    setPending(false);
    if (!result.ok) {
      setMessage(result.message || "Tournament registration could not be completed.");
      return;
    }
    setRegistered(true);
    setMessage(result.message || `Tournament registration ${result.data?.outcome ?? "confirmed"}.`);
  }

  return (
    <Card className="mt-6 p-6">
      <h2 className="text-xl font-black">Registration</h2>
      {participationMode === "team" ? (
        <p className="mt-3 text-sm text-slate-400">Team tournaments require joining or creating an eligible team from the tournament lobby.</p>
      ) : entryType !== "free" ? (
        <p className="mt-3 text-sm text-slate-400">Paid tournament entry is not available until payment setup is complete.</p>
      ) : status !== "registration_open" ? (
        <p className="mt-3 text-sm text-slate-400">Registration is not currently open.</p>
      ) : registered ? (
        <p role="status" className="mt-3 rounded-[8px] bg-emerald-950/40 p-3 text-sm font-bold text-emerald-200">{message}</p>
      ) : (
        <>
          <label className="mt-4 flex items-start gap-3 text-sm font-bold leading-6">
            <input className="mt-1" type="checkbox" checked={rulesAccepted} onChange={(event) => setRulesAccepted(event.target.checked)} />
            <span>I accept the Tournament rules and registration terms.</span>
          </label>
          {message ? <p role="alert" className="mt-3 rounded-[8px] bg-red-950/40 p-3 text-sm text-red-200">{message}</p> : null}
          <Button className="mt-4" disabled={!rulesAccepted || pending} onClick={() => void submit()}>
            {pending ? "Submitting..." : "Submit Tournament Registration"}
          </Button>
        </>
      )}
    </Card>
  );
}
