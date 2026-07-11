"use client";

import { useMemo, useRef, useState } from "react";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { CheckCircle2, ImageIcon, RotateCcw, Trash2, UploadCloud, Video } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { storage } from "@/lib/firebase/client";

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "upload";
}

export type MediaUploadKind = "image" | "video" | "media";

type UploadStatus = "idle" | "uploading" | "processing" | "success" | "failed";

export function MediaUploadField({
  label,
  value,
  onChange,
  storagePath,
  kind = "image",
  maxSizeMb,
  buttonLabel,
  helperText
}: {
  label: string;
  value?: string;
  onChange: (url: string, metadata?: { path: string; fileName: string; contentType: string; size: number }) => void;
  storagePath: string;
  kind?: MediaUploadKind;
  maxSizeMb?: number;
  buttonLabel?: string;
  helperText?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const retryFileRef = useRef<File | null>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [previewFailed, setPreviewFailed] = useState(false);

  const accept = kind === "image" ? "image/jpeg,image/png,image/webp" : kind === "video" ? "video/mp4,video/webm,video/quicktime" : "image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime";
  const defaultMax = kind === "video" ? 250 : kind === "media" ? 250 : 15;
  const limitMb = maxSizeMb ?? defaultMax;
  const isVideo = useMemo(() => Boolean(value && /\.(mp4|webm|mov|quicktime)(\?|$)/i.test(value)), [value]);
  const uploading = status === "uploading" || status === "processing";

  async function handleFile(file: File | undefined) {
    setError("");
    setPreviewFailed(false);
    if (!file) return;
    retryFileRef.current = file;
    if (!storage) {
      setStatus("failed");
      setError("Media uploads are temporarily unavailable while secure storage is being verified.");
      return;
    }
    const imageOk = file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp";
    const videoOk = file.type === "video/mp4" || file.type === "video/webm" || file.type === "video/quicktime";
    if ((kind === "image" && !imageOk) || (kind === "video" && !videoOk) || (kind === "media" && !imageOk && !videoOk)) {
      setStatus("failed");
      setError(kind === "video" ? "Upload an MP4, WebM, or QuickTime video." : kind === "image" ? "Upload a JPG, PNG, or WebP image." : "Upload a supported image or video file.");
      return;
    }
    if (file.size > limitMb * 1024 * 1024) {
      setStatus("failed");
      setError(`File must be ${limitMb}MB or smaller.`);
      return;
    }
    const safeName = sanitizeFileName(file.name);
    const path = `${storagePath.replace(/^\/+|\/+$/g, "")}/${Date.now()}-${safeName}`;
    setStatus("uploading");
    setProgress(0);
    try {
      const uploadTask = uploadBytesResumable(ref(storage, path), file, { contentType: file.type, customMetadata: { originalName: file.name } });
      const downloadUrl = await new Promise<string>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error("STORAGE_UPLOAD_TIMEOUT")), 90_000);
        uploadTask.on("state_changed", (snapshot) => {
          const nextProgress = Math.round((snapshot.bytesTransferred / Math.max(snapshot.totalBytes, 1)) * 100);
          setProgress(Math.max(0, Math.min(100, nextProgress)));
        }, (caught) => {
          window.clearTimeout(timer);
          reject(caught);
        }, async () => {
          window.clearTimeout(timer);
          setProgress(100);
          setStatus("processing");
          resolve(await getDownloadURL(uploadTask.snapshot.ref));
        });
      });
      onChange(downloadUrl, { path, fileName: file.name, contentType: file.type, size: file.size });
      setStatus("success");
      window.setTimeout(() => setStatus((current) => current === "success" ? "idle" : current), 2500);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Upload failed.";
      const storageUnavailable = message === "STORAGE_UPLOAD_TIMEOUT" || message.includes("storage/unauthorized") || message.includes("bucket");
      setStatus("failed");
      setError(storageUnavailable ? "Media uploads are not available until the secure Storage rules are published and verified." : message);
    }
  }

  function remove() {
    retryFileRef.current = null;
    setStatus("idle");
    setProgress(0);
    setError("");
    onChange("");
  }

  return (
    <div>
      <div className="mb-2 text-sm font-bold text-slate-300">{label}</div>
      <Card className="border-white/10 bg-black/30 p-4">
        {value ? (
          <div className="overflow-hidden rounded-[8px] border border-white/10 bg-[#111]">
            {isVideo ? <video src={value} controls className="max-h-72 w-full object-cover" /> : !previewFailed ? <img src={value} alt={label} onError={() => setPreviewFailed(true)} className="max-h-72 w-full object-cover" /> : <div className="flex h-40 items-center justify-center text-sm font-bold text-slate-400">Preview unavailable. The uploaded media URL is saved.</div>}
          </div>
        ) : (
          <button type="button" onClick={() => inputRef.current?.click()} className="flex min-h-36 w-full flex-col items-center justify-center rounded-[8px] border border-dashed border-white/15 bg-[#151515] px-4 py-8 text-center text-slate-300 hover:border-[var(--gold)]/50 hover:text-[var(--gold)]">
            {kind === "video" ? <Video className="mb-3" /> : kind === "image" ? <ImageIcon className="mb-3" /> : <UploadCloud className="mb-3" />}
            <span className="font-black">{buttonLabel ?? (kind === "video" ? "Upload Video" : kind === "image" ? "Upload Image" : "Upload Media")}</span>
            <span className="mt-2 text-xs text-slate-500">{kind === "video" ? "MP4, WebM, or QuickTime" : kind === "image" ? "JPG, PNG, or WebP" : "JPG, PNG, WebP, MP4, WebM, or QuickTime"}  -  up to {limitMb}MB</span>
          </button>
        )}
        <input ref={inputRef} className="hidden" type="file" accept={accept} onChange={(event) => void handleFile(event.target.files?.[0])} />
        {uploading ? <div className="mt-4"><div className="flex items-center justify-between text-xs font-bold text-slate-400"><span>{status === "processing" ? "Processing upload..." : "Uploading"}</span><span>{progress}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[var(--gold)] transition-all duration-300" style={{ width: `${progress}%` }} /></div><div className="mt-2 grid grid-cols-4 gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">{[25, 50, 75, 100].map((mark) => <span key={mark} className={progress >= mark ? "text-[var(--gold)]" : ""}>{mark}%</span>)}</div></div> : null}
        {status === "success" ? <p className="mt-3 flex items-center gap-2 rounded-[8px] bg-emerald-500/10 p-3 text-sm font-bold text-emerald-200"><CheckCircle2 size={16} /> Uploaded successfully.</p> : null}
        {value ? <div className="mt-4 flex flex-wrap gap-3"><Button type="button" variant="secondary" onClick={() => inputRef.current?.click()}><UploadCloud size={16} /> Replace</Button><Button type="button" variant="ghost" onClick={remove}><Trash2 size={16} /> Remove</Button></div> : null}
        {status === "failed" && retryFileRef.current ? <Button type="button" variant="secondary" className="mt-3" onClick={() => void handleFile(retryFileRef.current ?? undefined)}><RotateCcw size={16} /> Retry Upload</Button> : null}
        {helperText ? <p className="mt-3 text-xs leading-5 text-slate-500">{helperText}</p> : null}
        {error ? <p className="mt-3 rounded-[8px] bg-red-950/50 p-3 text-sm font-bold text-red-200">{error}</p> : null}
      </Card>
    </div>
  );
}
