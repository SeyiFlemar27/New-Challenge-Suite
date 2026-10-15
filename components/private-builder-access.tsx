"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "@/lib/api/client";
import { Button, Field, inputClass, LinkButton } from "@/components/ui";
import type { PrivateBuilderAccess } from "@/lib/private-challenge-builder";

export function PrivateBuilderAccessStep({ value, onChange, draftId, savedRevision, saveFailed, onSave }: { value: PrivateBuilderAccess; onChange: (value: PrivateBuilderAccess) => void; draftId?: string; savedRevision?: string; saveFailed?: boolean; onSave?: () => Promise<boolean> }) {
  const [saving, setSaving] = useState(false);
  const query = useQuery({ queryKey: ["private-credential-preparation", draftId, value.privateAccessMethod, savedRevision], enabled: Boolean(draftId), retry: 1, queryFn: () => apiRequest<{ prepared: boolean; method: string; sharingAvailable: boolean }>(`/api/private-challenges/${encodeURIComponent(draftId!)}/access?credentialStatus=true`, { cache: "no-store" }) });
  const prepared = query.data?.ok && query.data.data?.prepared && query.data.data.method === value.privateAccessMethod;
  const unavailable = saveFailed || query.isError || (query.data && (!query.data.ok || !query.data.data?.prepared));
  const name = value.privateAccessMethod === "invitation_code" ? "Invitation Code" : "Invite Link";
  async function retryPreparation() { setSaving(true); try { if (!onSave || await onSave()) await query.refetch(); } finally { setSaving(false); } }
  return <section className="space-y-7"><h2 data-normal-step-heading tabIndex={-1} className="text-3xl font-black">Access</h2>
    <Field label="Challenge Visibility"><select aria-label="Challenge Visibility" className={inputClass} value={value.publicPreviewEnabled ? "visible" : "hidden"} onChange={(event) => onChange({ ...value, publicPreviewEnabled: event.target.value === "visible", privateJoiningPolicy: event.target.value === "visible" ? "invite_and_request" : "invite_only", privateVotingAccess: "access_restricted" })}><option value="hidden">Invitation-only</option><option value="visible">Visible on Explore</option></select></Field>
    <p className="text-sm leading-6 text-slate-600">Explore visitors see a locked preview and may request access. Invitation-only challenges are hidden. Access never joins a challenge or reserves capacity.</p>
    <Field label="Invitation Method"><select aria-label="Invitation Method" className={inputClass} value={value.privateAccessMethod} onChange={(event) => onChange({ ...value, privateAccessMethod: event.target.value as PrivateBuilderAccess["privateAccessMethod"] })}><option value="invite_link">Invite Link</option><option value="invitation_code">Invitation Code</option></select></Field>
    <p className="text-sm leading-6 text-slate-600">The server prepares your credential securely. Share it after publication while registration is open. The method cannot change after publication.</p>
    <section className="space-y-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5" aria-label={`${name} preparation`}>
      <h3 role="status" aria-live="polite" className="font-bold">{prepared ? `${name} Prepared` : unavailable ? `${name} Unavailable` : `Preparing ${name}…`}</h3>
      <p className="text-sm leading-6">{prepared ? `Your secure ${name.toLowerCase()} has been generated and securely stored. You'll be able to share it once your challenge is approved and registration opens.` : unavailable ? "Preparation could not be confirmed. Save the selected method and retry. No sharing credential has been exposed." : "The server is securely preparing your selected invitation method. Save changes to confirm preparation."}</p>
      <p className="text-sm">After approval, open My Challenges → your challenge → Share &amp; Manage Access to reveal and copy it. An invitation grants access only; joining remains separate.</p>
      <div className="flex flex-wrap gap-3"><Button variant="secondary" disabled={saving || query.isFetching} onClick={() => void retryPreparation()}>{saving ? "Saving…" : "Save & Check Invitation"}</Button>{draftId ? <LinkButton variant="secondary" href={`/challenges/${draftId}/access`}>Share &amp; Manage Access</LinkButton> : null}</div>
    </section>
    {value.publicPreviewEnabled ? <label className="flex min-h-11 items-center gap-3 text-sm font-bold"><input type="checkbox" checked={value.privateVotingAccess === "public_voting"} onChange={(event) => onChange({ ...value, privateVotingAccess: event.target.checked ? "public_voting" : "access_restricted" })} />Allow public voting on approved competing submissions during voting</label> : null}
  </section>;
}
