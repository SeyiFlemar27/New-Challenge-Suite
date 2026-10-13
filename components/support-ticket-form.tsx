"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteObject, ref, uploadBytesResumable } from "firebase/storage";
import { LifeBuoy, Paperclip, Send, X } from "lucide-react";
import { apiRequest } from "@/lib/api/client";
import { useAuth } from "@/components/auth-provider";
import { storage } from "@/lib/firebase/client";
import { Button, Card, Field, PageTitle, inputClass, textareaClass } from "@/components/ui";
import { SUPPORT_CATEGORIES } from "@/lib/support/catalog";

const ACCEPTED_FILES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_BYTES = 5 * 1024 * 1024;

export function SupportTicketForm() {
  const auth = useAuth();
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);
  const [category, setCategory] = useState<keyof typeof SUPPORT_CATEGORIES>("account_security");
  const [issueType, setIssueType] = useState<string>(SUPPORT_CATEGORIES.account_security.issueTypes[0]);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [attachmentPaths, setAttachmentPaths] = useState<string[]>([]);

  async function upload(files: FileList | null) {
    if (!files?.length || !storage || !auth.user?.uid) { setNotice("File upload is unavailable until storage and sign-in are ready."); return; }
    const uploadStorage = storage;
    const selected = Array.from(files);
    if (attachmentPaths.length + selected.length > 3) { setNotice("A request can include at most three attachments."); return; }
    for (const file of selected) if (!ACCEPTED_FILES.has(file.type) || file.size < 1 || file.size > MAX_BYTES) { setNotice("Choose JPG, PNG, WebP, or PDF files up to 5 MB."); return; }
    setUploading(true);
    setUploadProgress(0);
    const uploadedPaths: string[] = [];
    try {
      const next = [...attachmentPaths];
      for (const [index, file] of selected.entries()) {
        const uploadId = crypto.randomUUID();
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "attachment";
        const path = `users/${auth.user.uid}/support/${uploadId}/${safeName}`;
        const task = uploadBytesResumable(ref(uploadStorage, path), file, { contentType: file.type });
        await new Promise<void>((resolve, reject) => task.on("state_changed", (snapshot) => setUploadProgress(Math.round(((index + snapshot.bytesTransferred / Math.max(1, snapshot.totalBytes)) / selected.length) * 100)), reject, resolve));
        uploadedPaths.push(path);
        next.push(path);
      }
      setAttachmentPaths(next);
      setNotice("Files uploaded to private quarantine. Downloads remain unavailable until security scanning is configured.");
    } catch (error) { await Promise.all(uploadedPaths.map(async (path) => { try { await deleteObject(ref(uploadStorage, path)); } catch { /* Orphan cleanup is best-effort; rules still keep the file private. */ } })); setNotice(error instanceof Error ? error.message : "Attachment upload failed."); }
    finally { setUploading(false); setUploadProgress(0); }
  }

  async function removeAttachment(path: string) {
    setAttachmentPaths((current) => current.filter((item) => item !== path));
    try { if (storage) await deleteObject(ref(storage, path)); } catch { /* The path is no longer attached; server-side ownership remains enforced. */ }
  }

  async function submit() {
    if (!auth.user || saving || uploading) return;
    idempotencyKey.current ??= crypto.randomUUID();
    setSaving(true);
    const result = await apiRequest<{ ticketId: string; ticketNumber: string }>("/api/support/tickets", {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey.current },
      body: JSON.stringify({ category, issueType, subject, description, contactEmail: contactEmail.trim() || undefined, attachmentPaths })
    });
    setNotice(result.message);
    setSaving(false);
    if (result.ok && result.data) {
      idempotencyKey.current = null;
      router.push(`/support/tickets/${encodeURIComponent(result.data.ticketId)}`);
    }
  }

  if (auth.loading) return <Card className="mt-7 p-6" aria-live="polite">Checking your sign-in…</Card>;
  if (!auth.user) return <><PageTitle title="Contact Support" subtitle="Sign in to create a private, trackable support request." icon={<LifeBuoy className="text-[var(--gold)]" />} /><Card className="mt-7 p-6"><p className="text-sm text-slate-400">Your account lets Support keep the conversation connected to the right records.</p><Link className="mt-5 inline-flex min-h-11 items-center rounded-[8px] bg-[var(--gold)] px-5 font-bold text-black" href="/auth/login?next=%2Fsupport%2Fnew">Sign in to continue</Link></Card></>;

  return <>
    <PageTitle title="Contact Support" subtitle="Tell us what happened. Your request stays linked to your authenticated account." icon={<LifeBuoy className="text-[var(--gold)]" />} />
    <Card className="mt-7 p-6">
      <div className="grid gap-5">
        <Field label="Category"><select className={inputClass} value={category} onChange={(event) => { const value = event.target.value as keyof typeof SUPPORT_CATEGORIES; setCategory(value); setIssueType(SUPPORT_CATEGORIES[value].issueTypes[0]); }}>
          {Object.entries(SUPPORT_CATEGORIES).map(([value, item]) => <option value={value} key={value}>{item.label}</option>)}
        </select></Field>
        <Field label="What is the issue about?"><select className={inputClass} value={issueType} onChange={(event) => setIssueType(event.target.value)}>{SUPPORT_CATEGORIES[category].issueTypes.map((value) => <option value={value} key={value}>{value.replaceAll("_", " ")}</option>)}</select></Field>
        <Field label="Subject"><input className={inputClass} value={subject} onChange={(event) => setSubject(event.target.value)} minLength={5} maxLength={200} autoComplete="off" /></Field>
        <Field label="Description"><textarea className={textareaClass} value={description} onChange={(event) => setDescription(event.target.value)} minLength={10} maxLength={10_000} rows={8} /><span className="mt-1 block text-xs text-slate-500">10–10,000 characters. Do not include passwords, one-time codes, full card data, or authentication tokens.</span></Field>
        <Field label="Contact email (optional)"><input className={inputClass} type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} maxLength={254} placeholder={auth.user.email ?? "Use your account email"} /><span className="mt-1 block text-xs text-slate-500">If supplied, this unverified address receives ticket correspondence. It does not authorize account changes or access.</span></Field>
        <Field label="Attachments (optional)"><input className={inputClass} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple disabled={uploading || attachmentPaths.length >= 3} onChange={(event) => { void upload(event.target.files); event.currentTarget.value = ""; }} /><span className="mt-1 block text-xs text-slate-500">Up to three JPG, PNG, WebP, or PDF files, 5 MB each. Files remain quarantined until a scanner is configured.</span>{uploading ? <progress className="mt-2 w-full" value={uploadProgress} max={100} aria-label="Attachment upload progress">{uploadProgress}%</progress> : null}</Field>
        {attachmentPaths.length ? <ul aria-label="Attached files" className="grid gap-2">{attachmentPaths.map((path, index) => <li key={path} className="flex items-center justify-between rounded-[8px] border border-white/10 px-3 py-2 text-sm"><span className="inline-flex items-center gap-2"><Paperclip size={15} />Attachment {index + 1} · Quarantined</span><button type="button" className="rounded p-2 text-slate-400 hover:text-white" aria-label={`Remove attachment ${index + 1}`} onClick={() => void removeAttachment(path)}><X size={16} /></button></li>)}</ul> : null}
        <Button onClick={() => void submit()} disabled={saving || uploading || subject.trim().length < 5 || description.trim().length < 10}><Send size={17} /> {saving ? "Submitting…" : "Submit request"}</Button>
        {notice ? <p role="status" aria-live="polite" className="text-sm">{notice}</p> : null}
      </div>
    </Card>
  </>;
}
