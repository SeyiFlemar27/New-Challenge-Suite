type Evidence = Record<string, unknown>;
const record = (value: unknown): Evidence => value && typeof value === "object" && !Array.isArray(value) ? value as Evidence : {};
const rows = (value: unknown): Evidence[] => Array.isArray(value) ? value.map(record) : [];
const text = (value: unknown) => value === undefined || value === null || value === "" ? "Not recorded" : String(value);
function amount(row: Evidence) {
  const currency = String(row.currency ?? "").toUpperCase();
  return typeof row.amountCents === "number" && Number.isSafeInteger(row.amountCents) && /^[A-Z]{3}$/.test(currency)
    ? new Intl.NumberFormat("en", { style: "currency", currency }).format(row.amountCents / 100) : "Amount unavailable";
}

/** Authorized Admin evidence only. A review display is never a resolution action. */
export function IndividualCorrectionEvidence({ proposal }: { proposal: unknown }) {
  const data = record(proposal), original = record(data.originalResult), proposed = record(data.proposedResult);
  return <div className="min-w-0 space-y-4 break-words text-sm">
    <div className="grid gap-3 sm:grid-cols-2"><section className="rounded-lg bg-white p-3"><h4 className="font-bold">Original recorded result</h4><p>Winner: {text(original.winnerParticipantId)}</p><p>Loser: {text(original.loserParticipantId)}</p><p>Status: {text(original.resultStatus)}</p></section><section className="rounded-lg bg-white p-3"><h4 className="font-bold">Verified proposed correction — not applied</h4><p>Winner: {text(proposed.winnerParticipantId)}</p><p>Loser: {text(proposed.loserParticipantId)}</p><p>Evidence reference: {text(data.evidenceReference)}</p><p>Review reason: {text(data.reason)}</p></section></div>
    <section><h4 className="font-bold">Affected matches and preserved outcomes</h4><ul className="list-inside list-disc space-y-1 break-words">{rows(data.affectedMatches).map(row => <li key={text(row.id)}>{text(row.id)} · {text(row.status)} · recorded winner: {text(row.winnerParticipantId)} · recorded loser: {text(row.loserParticipantId)}</li>)}</ul></section>
    <section><h4 className="font-bold">Participants — legitimate losses unchanged</h4><ul className="list-inside list-disc space-y-1 break-words">{rows(data.participants).map(row => <li key={text(row.id)}>{text(row.id)} · {text(row.status)} · losses: {text(row.legitimateLossCount)}</li>)}</ul></section>
    <section><h4 className="font-bold">Affected prize placements — under review</h4>{rows(data.affectedPlacements).length ? <ul className="list-inside list-disc break-words">{rows(data.affectedPlacements).map(row => <li key={text(row.id)}>Place {text(row.placement)} · {text(row.participantId)} · source: {text(row.sourceMatchId)}</li>)}</ul> : <p>No recorded placements are affected yet.</p>}</section>
    <section><h4 className="font-bold">Related financial consequences</h4>{rows(data.financialConsequences).length ? <ul className="space-y-2 break-words">{rows(data.financialConsequences).map(row => <li key={text(row.creditId)} className="rounded-lg bg-white p-3">{text(row.creditId)} · {amount(row)} · recipient {text(row.userId)} · {text(row.balanceBucket)}. {row.manualRecoveryRequired === true ? "Already withdrawn or paid: manual recovery review; no reversal executed." : "Further release held; no replacement credit or negative balance created."}</li>)}</ul> : <p>No related internal prize credit has been recorded. Affected placement verification remains held.</p>}</section>
    <p className="font-semibold">Outstanding decision: a separately approved written competitive correction rule. Original scores, submissions, votes and audit records remain preserved.</p>
  </div>;
}
