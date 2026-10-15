"use client";
import { Field, inputClass } from "@/components/ui";
import type { PrivateBuilderAccess } from "@/lib/private-challenge-builder";

export function PrivateBuilderAccessStep({ value, onChange }: { value: PrivateBuilderAccess; onChange: (value: PrivateBuilderAccess) => void }) {
  return <section className="space-y-7"><h2 data-normal-step-heading tabIndex={-1} className="text-3xl font-black">Access</h2>
    <Field label="Challenge Visibility"><select aria-label="Challenge Visibility" className={inputClass} value={value.publicPreviewEnabled ? "visible" : "hidden"} onChange={(event) => onChange({ ...value, publicPreviewEnabled: event.target.value === "visible", privateJoiningPolicy: event.target.value === "visible" ? "invite_and_request" : "invite_only", privateVotingAccess: "access_restricted" })}><option value="hidden">Invitation-only</option><option value="visible">Visible on Explore</option></select></Field>
    <p className="text-sm leading-6 text-slate-600">Explore visitors see a locked preview and may request access. Invitation-only challenges are hidden. Access never joins a challenge or reserves capacity.</p>
    <Field label="Invitation Method"><select aria-label="Invitation Method" className={inputClass} value={value.privateAccessMethod} onChange={(event) => onChange({ ...value, privateAccessMethod: event.target.value as PrivateBuilderAccess["privateAccessMethod"] })}><option value="invite_link">Invite Link</option><option value="invitation_code">Invitation Code</option></select></Field>
    <p className="text-sm leading-6 text-slate-600">The server prepares your credential securely. Share it after publication while registration is open. The method cannot change after publication.</p>
    {value.publicPreviewEnabled ? <label className="flex min-h-11 items-center gap-3 text-sm font-bold"><input type="checkbox" checked={value.privateVotingAccess === "public_voting"} onChange={(event) => onChange({ ...value, privateVotingAccess: event.target.checked ? "public_voting" : "access_restricted" })} />Allow public voting on approved competing submissions during voting</label> : null}
  </section>;
}
