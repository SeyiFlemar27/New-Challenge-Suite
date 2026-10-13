"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Paperclip, Send, X } from "lucide-react";
import { deleteObject, ref, uploadBytesResumable } from "firebase/storage";
import { AppShell } from "@/components/app-shell";
import { apiRequest } from "@/lib/api/client";
import { auth, storage } from "@/lib/firebase/client";
import { Button, Card, PageTitle } from "@/components/ui";

type Message = { id: string; authorType: string; body: string; createdAt: string; attachmentPaths?: string[]; emailDeliveryStatus?: string | null };
type Ticket = { id: string; ticketNumber: string; subject: string; category: string; issueType: string; status: string; canReply: boolean; createdAt: string; reopenUntil?: string | null; resolutionSummary?: string | null; attachments?: Array<{ path: string; scanStatus: string }> };
type Issue = { id: string; title: string; issueType: string; condition: string; customerExplanation?: string | null };
const fileTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export default function SupportTicketDetailsPage() {
  const params = useParams<{ ticketId: string }>();
  const ticketId = String(params.ticketId ?? "");
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [reply, setReply] = useState("");
  const [files, setFiles] = useState<Array<{ path: string; scanStatus: string }>>([]);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const replyIdempotencyKey = useRef<string | null>(null);

  async function load() {
    const result = await apiRequest<{ ticket: Ticket; messages: Message[]; issues: Issue[] }>(`/api/support/tickets/${encodeURIComponent(ticketId)}/messages`);
    if (result.data) { setTicket(result.data.ticket); setMessages(result.data.messages); setIssues(result.data.issues); setNotice(""); }
    else setNotice(result.message);
    setLoading(false);
  }
  useEffect(() => {
    let active = true;
    if (ticketId) {
      void apiRequest<{ ticket: Ticket; messages: Message[]; issues: Issue[] }>(`/api/support/tickets/${encodeURIComponent(ticketId)}/messages`).then((result) => {
        if (!active) return;
        if (result.data) { setTicket(result.data.ticket); setMessages(result.data.messages); setIssues(result.data.issues); setNotice(""); }
        else setNotice(result.message);
        setLoading(false);
      }).catch(() => {
        if (!active) return;
        setNotice("Support request could not be loaded.");
        setLoading(false);
      });
    }
    return () => { active = false; };
  }, [ticketId]);

  async function upload(selected: FileList | null) {
    if (!selected?.length || !storage) { setNotice("File upload is unavailable right now."); return; }
    const uploadStorage = storage;
    if (files.length + selected.length > 3) { setNotice("A message can include at most three files."); return; }
    const selectedFiles = Array.from(selected);
    for (const file of selectedFiles) if (!fileTypes.has(file.type) || file.size < 1 || file.size > 5 * 1024 * 1024) { setNotice("Choose JPG, PNG, WebP, or PDF files up to 5 MB."); return; }
    setBusy(true); setUploadProgress(0);
    const uploadedPaths: string[] = [];
    try {
      const next = [...files];
      for (const [index, file] of selectedFiles.entries()) {
        const uid = auth?.currentUser?.uid;
        if (!uid) throw new Error("Sign in again before uploading a file.");
        const path = `users/${uid}/support/${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "attachment"}`;
        const task = uploadBytesResumable(ref(uploadStorage, path), file, { contentType: file.type });
        await new Promise<void>((resolve, reject) => task.on("state_changed", (snapshot) => setUploadProgress(Math.round(((index + snapshot.bytesTransferred / Math.max(1, snapshot.totalBytes)) / selectedFiles.length) * 100)), reject, resolve));
        uploadedPaths.push(path);
        next.push({ path, scanStatus: "quarantined" });
      }
      setFiles(next); replyIdempotencyKey.current = null; setNotice("Files are uploaded privately and remain quarantined until scanning is available.");
    } catch (error) { await Promise.all(uploadedPaths.map(async (path) => { try { await deleteObject(ref(uploadStorage, path)); } catch { /* Orphaned content remains private and cannot be downloaded. */ } })); setNotice(error instanceof Error ? error.message : "File upload failed."); }
    finally { setBusy(false); setUploadProgress(0); }
  }

  async function sendReply() {
    if (!ticket || (!reply.trim() && !files.length) || busy) return;
    replyIdempotencyKey.current ??= crypto.randomUUID();
    setBusy(true);
    const result = await apiRequest(`/api/support/tickets/${encodeURIComponent(ticket.id)}/messages`, { method: "POST", headers: { "idempotency-key": replyIdempotencyKey.current }, body: JSON.stringify({ message: reply, attachmentPaths: files.map((file) => file.path) }) });
    setNotice(result.message); setBusy(false);
    if (result.ok) { setReply(""); setFiles([]); replyIdempotencyKey.current = null; await load(); }
  }

  async function removeFile(path: string) {
    setFiles((current) => current.filter((file) => file.path !== path));
    replyIdempotencyKey.current = null;
    try { if (storage) await deleteObject(ref(storage, path)); }
    catch { setNotice("The attachment was removed from this reply, but private temporary cleanup could not be confirmed."); }
  }

  const status = ticket?.status.replaceAll("_", " ") ?? "";
  return <AppShell><div className="mx-auto max-w-4xl"><PageTitle title={loading ? "Support request" : ticket?.subject ?? "Support request"} subtitle={ticket ? `${ticket.ticketNumber} · ${status}` : "Your private conversation with Support."} />{notice && !ticket ? <Card className="mt-6 p-5" role="alert">{notice}</Card> : null}{loading ? <Card className="mt-6 h-40 animate-pulse" aria-live="polite" /> : ticket ? <>
    {ticket.resolutionSummary ? <Card className="mt-6 border-emerald-400/30 p-5"><p className="text-xs font-bold uppercase text-emerald-400">Support outcome</p><p className="mt-2 whitespace-pre-wrap">{ticket.resolutionSummary}</p></Card> : null}
    {issues.length ? <section className="mt-6"><h2 className="text-lg font-black">Issue progress</h2><div className="mt-3 grid gap-3">{issues.map((issue) => <Card key={issue.id} className="p-4"><div className="flex flex-wrap justify-between gap-3"><h3 className="font-bold">{issue.title}</h3><span className="text-xs font-bold uppercase text-[var(--gold)]">{issue.condition.replaceAll("_", " ")}</span></div>{issue.customerExplanation ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{issue.customerExplanation}</p> : null}</Card>)}</div></section> : null}
    <Card className="mt-6 p-5"><p className="text-xs font-bold uppercase text-slate-500">{ticket.category.replaceAll("_", " ")} · {ticket.issueType.replaceAll("_", " ")}</p><div className="mt-5 space-y-4">{messages.map((message) => <article key={message.id} className="rounded-[8px] border border-white/10 p-4"><div className="flex flex-wrap justify-between gap-2"><p className="text-xs font-bold uppercase text-[var(--gold)]">{message.authorType === "support" ? "Challenge Suite Support" : "You"}</p><time className="text-xs text-slate-500">{new Date(message.createdAt).toLocaleString()}</time></div>{message.body ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{message.body}</p> : null}{message.attachmentPaths?.length ? <ul className="mt-3 grid gap-2">{message.attachmentPaths.map((path) => { const state = ticket.attachments?.find((item) => item.path === path)?.scanStatus ?? "quarantined"; return <li key={path} className="text-sm">{state === "cleared" ? <a className="underline" href={`/api/support/tickets/${encodeURIComponent(ticket.id)}/attachments?path=${encodeURIComponent(path)}`}><Paperclip className="mr-2 inline" size={15}/>Download attachment</a> : <span className="text-slate-400"><Paperclip className="mr-2 inline" size={15}/>Attachment quarantined while security scanning is unavailable</span>}</li>; })}</ul> : null}</article>)}</div></Card>
    {ticket.canReply ? <Card className="mt-6 p-5"><h2 className="text-lg font-black">Reply to Support</h2><label className="mt-4 block text-sm font-bold">Message<textarea aria-label="Reply to Support" className="mt-2 min-h-28 w-full rounded-[8px] border border-white/10 bg-black/30 p-3" value={reply} onChange={(event) => { if (event.target.value !== reply) replyIdempotencyKey.current = null; setReply(event.target.value); }} maxLength={10_000}/></label><label className="mt-4 block text-sm font-bold">Add files <input className="mt-2 block w-full text-sm" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" disabled={busy || files.length >= 3} onChange={(event) => { void upload(event.target.files); event.currentTarget.value = ""; }}/></label>{busy && uploadProgress > 0 ? <progress className="mt-2 w-full" value={uploadProgress} max={100} aria-label="Attachment upload progress">{uploadProgress}%</progress> : null}{files.length ? <ul className="mt-3 space-y-2">{files.map((file, index) => <li key={file.path} className="flex items-center justify-between gap-3 text-xs text-slate-400"><span>Attachment {index + 1} · Quarantined</span><button type="button" aria-label={`Remove attachment ${index + 1}`} disabled={busy} onClick={() => void removeFile(file.path)} className="rounded p-2 hover:text-white"><X size={15}/></button></li>)}</ul> : null}<Button className="mt-4" onClick={() => void sendReply()} disabled={busy || (!reply.trim() && !files.length)}><Send size={16}/>{busy ? "Sending…" : "Send reply"}</Button>{notice ? <p role="status" className="mt-3 text-sm">{notice}</p> : null}</Card> : <Card className="mt-6 p-5"><p>This ticket is {ticket.status === "closed" ? "closed and read-only" : "past the seven-day response window"}. Create a new request for further help.</p></Card>}
  </> : <Card className="mt-6 p-5" role="alert">{notice || "Support request not found."}</Card>}</div></AppShell>;
}
