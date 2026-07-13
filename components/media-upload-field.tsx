"use client";

import { useMemo, useRef, useState } from "react";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { CheckCircle2, ImageIcon, RotateCcw, Trash2, UploadCloud, Video } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { useAuth } from "@/components/auth-provider";
import { storage } from "@/lib/firebase/client";
import { appendUploadFileName, classifyStorageError, defaultMaxSizeMb, mediaAccept, mediaErrorMessage, type MediaUploadKind, type MediaUploadStage, validateMediaFile } from "@/lib/media-upload";

export type { MediaUploadKind, MediaUploadStage } from "@/lib/media-upload";

type UploadMetadata = { path: string; fileName: string; contentType: string; size: number };

export function MediaUploadField({
  label,
  value,
  onChange,
  storagePath,
  kind = "image",
  maxSizeMb,
  buttonLabel,
  helperText,
  required = false,
  onStatusChange
}: {
  label: string;
  value?: string;
  onChange: (url: string, metadata?: UploadMetadata) => void;
  storagePath: string;
  kind?: MediaUploadKind;
  maxSizeMb?: number;
  buttonLabel?: string;
  helperText?: string;
  required?: boolean;
  onStatusChange?: (status: MediaUploadStage) => void;
}) {
  const auth = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const retryFileRef = useRef<File | null>(null);
  const [status, setStatusState] = useState<MediaUploadStage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [previewFailed, setPreviewFailed] = useState(false);
  const [localPreview, setLocalPreview] = useState("");

  const accept = mediaAccept(kind);
  const limitMb = maxSizeMb ?? defaultMaxSizeMb(kind);
  const isVideo = useMemo(() => Boolean((localPreview || value) && /\.(mp4|webm|mov|quicktime)(\?|$)/i.test(localPreview || value || "")), [localPreview, value]);
  const uploading = status === "preparing" || status === "uploading" || status === "processing";
  const displayUrl = localPreview || value || "";

  function setStatus(next: MediaUploadStage) {
    setStatusState(next);
    onStatusChange?.(next);
  }

  function setPreview(file: File | null) {
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(file ? URL.createObjectURL(file) : "");
  }

  async function handleFile(file: File | undefined) {
    setError("");
    setPreviewFailed(false);
    if (!file) return;
    retryFileRef.current = file;
    setPreview(file);
    setStatus("preparing");
    setProgress(0);

    if (!storage) {
      setStatus("failed");
      setError(mediaErrorMessage("storage_unavailable"));
      return;
    }
    if (!auth.user) {
      setStatus("failed");
      setError(mediaErrorMessage("unauthenticated"));
      return;
    }

    const validation = validateMediaFile(file, kind, limitMb);
    if (!validation.ok) {
      setStatus("failed");
      setError(validation.message);
      return;
    }

    const path = appendUploadFileName(storagePath, file.name);
    setStatus("uploading");
    try {
      const uploadTask = uploadBytesResumable(ref(storage, path), file, { contentType: file.type, customMetadata: { originalName: file.name, uploadedBy: auth.user.uid } });
      const downloadUrl = await new Promise<string>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error("STORAGE_UPLOAD_TIMEOUT")), 120_000);
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
          try {
            resolve(await getDownloadURL(uploadTask.snapshot.ref));
          } catch (caught) {
            reject(caught instanceof Error ? caught : new Error("PROCESSING_FAILED"));
          }
        });
      });
      onChange(downloadUrl, { path, fileName: file.name, contentType: file.type, size: file.size });
      setLocalPreview("");
      setStatus("complete");
      window.setTimeout(() => setStatusState((current) => current === "complete" ? "idle" : current), 2500);
    } catch (caught) {
      const classified = classifyStorageError(caught instanceof Error && caught.message === "PROCESSING_FAILED" ? new Error("processing failed") : caught);
      setStatus("failed");
      setError(classified.message);
    }
  }

  function remove() {
    retryFileRef.current = null;
    setPreview(null);
    setStatus("idle");
    setProgress(0);
    setError("");
    onChange("");
  }

  const stageLabel = status === "preparing" ? "Preparing upload" : status === "processing" ? "Processing upload" : status === "uploading" ? "Uploading" : status === "complete" ? "Complete" : status === "failed" ? "Failed" : "Ready";

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm font-bold text-slate-300"><span>{label}</span>{required ? <span className="text-xs uppercase tracking-[0.14em] text-[var(--gold)]">Required</span> : null}</div>
      <Card className="border-white/10 bg-black/30 p-4">
        {displayUrl ? (
          <div className="overflow-hidden rounded-[8px] border border-white/10 bg-[#111]">
            {isVideo ? <video src={displayUrl} controls className="max-h-72 w-full object-cover" /> : !previewFailed ? <img src={displayUrl} alt={label} onError={() => setPreviewFailed(true)} className="max-h-72 w-full object-cover" /> : <div className="flex h-40 items-center justify-center text-sm font-bold text-slate-400">Preview unavailable. The uploaded media URL is saved.</div>}
          </div>
        ) : (
          <button type="button" onClick={() => inputRef.current?.click()} className="flex min-h-36 w-full flex-col items-center justify-center rounded-[8px] border border-dashed border-white/15 bg-[#151515] px-4 py-8 text-center text-slate-300 hover:border-[var(--gold)]/50 hover:text-[var(--gold)]">
            {kind === "video" ? <Video className="mb-3" /> : kind === "image" ? <ImageIcon className="mb-3" /> : <UploadCloud className="mb-3" />}
            <span className="font-black">{buttonLabel ?? (kind === "video" ? "Upload Video" : kind === "image" ? "Upload Image" : "Upload Media")}</span>
            <span className="mt-2 text-xs text-slate-500">{kind === "video" ? "MP4, WebM, or QuickTime" : kind === "image" ? "JPG, PNG, or WebP" : "JPG, PNG, WebP, MP4, WebM, or QuickTime"} - up to {limitMb}MB</span>
          </button>
        )}
        <input ref={inputRef} className="hidden" type="file" accept={accept} onChange={(event) => void handleFile(event.target.files?.[0])} />
        {uploading ? <div className="mt-4"><div className="flex items-center justify-between text-xs font-bold text-slate-400"><span>{stageLabel}</span><span>{progress}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[var(--gold)] transition-all duration-300" style={{ width: `${progress}%` }} /></div><div className="mt-2 grid grid-cols-4 gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">{[25, 50, 75, 100].map((mark) => <span key={mark} className={progress >= mark ? "text-[var(--gold)]" : ""}>{mark}%</span>)}</div></div> : null}
        {status === "complete" ? <p className="mt-3 flex items-center gap-2 rounded-[8px] bg-emerald-500/10 p-3 text-sm font-bold text-emerald-200"><CheckCircle2 size={16} /> Uploaded successfully.</p> : null}
        {value ? <div className="mt-4 flex flex-wrap gap-3"><Button type="button" variant="secondary" onClick={() => inputRef.current?.click()}><UploadCloud size={16} /> Replace</Button><Button type="button" variant="ghost" onClick={remove}><Trash2 size={16} /> Remove</Button></div> : null}
        {status === "failed" && retryFileRef.current ? <Button type="button" variant="secondary" className="mt-3" onClick={() => void handleFile(retryFileRef.current ?? undefined)}><RotateCcw size={16} /> Retry Upload</Button> : null}
        {helperText ? <p className="mt-3 text-xs leading-5 text-slate-500">{helperText}</p> : null}
        {error ? <p className="mt-3 rounded-[8px] bg-red-950/50 p-3 text-sm font-bold text-red-200">{error}</p> : null}
      </Card>
    </div>
  );
}
