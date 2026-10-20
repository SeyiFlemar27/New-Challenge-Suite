"use client";
import { useState } from "react";
import { apiRequest } from "@/lib/api/client";
import { useAuth } from "@/components/auth-provider";
import { MediaUploadField, type UploadMetadata } from "@/components/media-upload-field";
import { Button, Card, Field, inputClass, textareaClass } from "@/components/ui";
export function NormalPublishedDetailsEditor({ challenge, challengeId, source = "challenges", onComplete }: { challenge: Record<string, unknown>; challengeId: string; source?: "challenges" | "tournaments"; onComplete?: () => void }) {
  const { user } = useAuth();
  const [title, setTitle] = useState(String(challenge.title ?? ""));
  const [description, setDescription] = useState(String(challenge.description ?? ""));
  const cover = challenge.coverMedia as { url?: string } | undefined;
  const [image, setImage] = useState<(UploadMetadata & { url: string }) | null>(null);
  const [uploading, setUploading] = useState(false);
  const [reason, setReason] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  async function save(cancel = false) {
    if (busy || uploading || (cancel && reason.trim().length < 8)) return;
    setBusy(true);
    try {
      const media = image ? { coverImageUrl: image.url, coverImagePath: image.path, ...(source === "challenges" && Array.isArray(challenge.challengeImages) && challenge.challengeImages.length ? { challengeImages: [{ ...image, id: crypto.randomUUID() }, ...challenge.challengeImages.slice(1)] } : {}) } : {};
      const result = await apiRequest("/api/" + source + "/" + encodeURIComponent(challengeId) + "/" + (cancel ? "lifecycle" : "published-details"), { method: cancel ? "POST" : "PATCH", body: JSON.stringify(cancel ? { action: "cancel", reason, confirmed: true } : { title, description, ...media, ...(reason.trim() ? { reason } : {}), expectedUpdatedAt: challenge.updatedAt }) });
      setNotice(result.message);
      if (result.ok) { if (onComplete) onComplete(); else window.location.reload(); }
    } catch { setNotice("The change could not be saved. Please retry."); }
    finally { setBusy(false); }
  }
  return <Card className="mt-5 space-y-4 p-5"><h2 className="font-bold">Edit published details</h2><Field label="Title"><input className={inputClass} value={title} onChange={event => setTitle(event.target.value)} maxLength={120} /></Field><Field label="Description"><textarea className={textareaClass} value={description} onChange={event => setDescription(event.target.value)} maxLength={1200} /></Field>{user ? <MediaUploadField label="Replace cover image (optional)" value={image?.url ?? String(challenge.coverImageUrl ?? cover?.url ?? "")} storagePath={source + "/drafts/" + user.uid + "/" + (source === "tournaments" ? "cover" : "banner")} kind="image" maxSizeMb={10} onChange={(url, metadata) => { if (url && metadata) setImage({ ...metadata, url }); }} onStatusChange={status => setUploading(["preparing", "uploading", "processing"].includes(status))} /> : null}<Field label="Edit note (optional; required for cancellation)"><input className={inputClass} value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} /></Field><p className="text-sm text-[var(--muted)]">Descriptions and verified promotional media update immediately. Participant, competition and financial commitments stay protected.</p><div className="flex flex-wrap gap-3"><Button disabled={busy || uploading || !title.trim() || !description.trim()} onClick={() => void save()}>Save published details</Button>{source === "challenges" && challenge.builderVersion === "normal_v3" && !challenge.effectiveVotingStartsAt && !["completed", "cancelled", "winners_announced"].includes(String(challenge.status)) ? <Button variant="secondary" disabled={busy || reason.trim().length < 8} onClick={() => void save(true)}>Request cancellation</Button> : null}</div>{notice ? <p role="status">{notice}</p> : null}</Card>;
}
