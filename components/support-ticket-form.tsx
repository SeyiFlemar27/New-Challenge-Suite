"use client";
import { useState } from "react";
import { LifeBuoy, Send } from "lucide-react";
import { ref, uploadBytes } from "firebase/storage";
import { apiRequest } from "@/lib/api/client";
import { useAuth } from "@/components/auth-provider";
import { storage } from "@/lib/firebase/client";
import { Button, Card, Field, PageTitle, inputClass, textareaClass } from "@/components/ui";

export function SupportTicketForm() {
  const auth = useAuth();
  const [category, setCategory] = useState("account"); const [subject, setSubject] = useState(""); const [description, setDescription] = useState(""); const [notice, setNotice] = useState(""); const [saving, setSaving] = useState(false); const [uploading, setUploading] = useState(false); const [attachmentPaths, setAttachmentPaths] = useState<string[]>([]);
  async function upload(files: FileList | null) {
    if (!files?.length || !storage || !auth.user?.uid) { setNotice("File upload is unavailable until storage and sign-in are ready."); return; }
    setUploading(true);
    try {
      const next = [...attachmentPaths];
      for (const file of Array.from(files)) {
        if (!new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]).has(file.type) || file.size > 10 * 1024 * 1024) throw new Error("Choose JPG, PNG, WebP, or PDF files up to 10 MB.");
        if (next.length >= 5) throw new Error("A ticket can include at most five attachments.");
        const uploadId = crypto.randomUUID(); const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "attachment";
        const path = `users/${auth.user.uid}/support/${uploadId}/${safeName}`;
        await uploadBytes(ref(storage, path), file, { contentType: file.type }); next.push(path);
      }
      setAttachmentPaths(next); setNotice("Attachment uploaded.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Attachment upload failed."); }
    finally { setUploading(false); }
  }
  async function submit() { setSaving(true); const result = await apiRequest<{ ticketNumber?: string }>("/api/support/tickets", { method: "POST", body: JSON.stringify({ category, subject, description, prioritySuggestion: "normal", attachmentPaths, contactPreference: "email" }) }); setNotice(result.data?.ticketNumber ? `${result.message} Ticket ${result.data.ticketNumber}.` : result.message); if (result.ok) { setSubject(""); setDescription(""); setAttachmentPaths([]); } setSaving(false); }
  return <><PageTitle title="Contact Support" subtitle="Create a support ticket linked to your authenticated account." icon={<LifeBuoy className="text-[var(--gold)]" />} /><Card className="mt-7 p-6"><div className="grid gap-5"><Field label="Category"><select className={inputClass} value={category} onChange={(event) => setCategory(event.target.value)}>{["account", "challenge", "payment", "payout", "refund", "submission", "voting", "sponsor", "event", "tournament", "technical_issue", "safety_concern", "other"].map((value) => <option value={value} key={value}>{value.replaceAll("_", " ")}</option>)}</select></Field><Field label="Subject"><input className={inputClass} value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={160} /></Field><Field label="Description"><textarea className={textareaClass} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} rows={8} /></Field><Field label="Image or PDF attachments"><input className={inputClass} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple disabled={uploading || attachmentPaths.length >= 5} onChange={(event) => void upload(event.target.files)} /><span className="mt-1 block text-xs text-slate-500">Up to five files, 10 MB each. {attachmentPaths.length} uploaded.</span></Field><Button onClick={() => void submit()} disabled={saving || uploading || subject.length < 5 || description.length < 20}><Send size={17} /> {saving ? "Submitting..." : "Submit Ticket"}</Button>{notice ? <p role="status" className="text-sm">{notice}</p> : null}</div></Card></>;
}
