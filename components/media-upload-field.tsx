"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getDownloadURL, ref, uploadBytesResumable, type UploadTask } from "firebase/storage";
import { CheckCircle2, ImageIcon, RotateCcw, Trash2, UploadCloud, Video, XCircle } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { useAuth } from "@/components/auth-provider";
import { firebaseClientConfigStatus, storage } from "@/lib/firebase/client";
import { appendUploadFileName, classifyStorageError, defaultMaxSizeMb, formatUploadBytes, mediaAccept, mediaErrorMessage, type MediaUploadKind, type MediaUploadStage, validateMediaFile } from "@/lib/media-upload";

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
  disabled = false,
  disabledReason = "Media uploads are temporarily unavailable while storage is being connected.",
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
  disabled?: boolean;
  disabledReason?: string;
  onStatusChange?: (status: MediaUploadStage) => void;
}) {
  const auth = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const retryFileRef = useRef<File | null>(null);
  const localPreviewRef = useRef("");
  const uploadTaskRef = useRef<UploadTask | null>(null);
  const uploadStartedAtRef = useRef(0);
  const lastProgressAtRef = useRef(0);
  const lastBytesTransferredRef = useRef(0);
  const [status, setStatusState] = useState<MediaUploadStage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [previewFailed, setPreviewFailed] = useState(false);
  const [localPreview, setLocalPreview] = useState("");
  const [selectedFile, setSelectedFile] = useState<{ name: string; size: number; type: string } | null>(null);
  const [uploadedFile, setUploadedFile] = useState<UploadMetadata | null>(null);
  const [uploadSpeed, setUploadSpeed] = useState("");
  const [removedNotice, setRemovedNotice] = useState("");

  const accept = mediaAccept(kind);
  const limitMb = maxSizeMb ?? defaultMaxSizeMb(kind);
  const isVideo = useMemo(() => Boolean((localPreview || value) && /\.(mp4|webm|mov|quicktime)(\?|$)/i.test(localPreview || value || "")), [localPreview, value]);
  const uploading = status === "preparing" || status === "uploading" || status === "processing";
  const displayUrl = localPreview || value || "";
  const displayFile = selectedFile ?? uploadedFile;
  const displayFileName = selectedFile?.name ?? uploadedFile?.fileName ?? "Uploaded media";
  const displayFileSize = selectedFile?.size ?? uploadedFile?.size ?? 0;
  const hasUploadedValue = Boolean(value);
  const displayProgress = (value && !uploading && status !== "failed") ? 100 : progress;

  function setStatus(next: MediaUploadStage) {
    setStatusState(next);
    onStatusChange?.(next);
  }

  useEffect(() => () => {
    if (localPreviewRef.current) URL.revokeObjectURL(localPreviewRef.current);
    uploadTaskRef.current?.cancel();
  }, []);

  function setPreview(file: File | null) {
    if (localPreviewRef.current) URL.revokeObjectURL(localPreviewRef.current);
    const nextPreview = file ? URL.createObjectURL(file) : "";
    localPreviewRef.current = nextPreview;
    setLocalPreview(nextPreview);
  }

  function resetFileInput() {
    if (inputRef.current) inputRef.current.value = "";
  }

  function logUploadDebug(event: string, details: Record<string, unknown>) {
    if (process.env.NODE_ENV !== "development") return;
    console.info("[media-upload]", {
      event,
      label,
      storageConfigured: firebaseClientConfigStatus.storageConfigured,
      storageInitialized: firebaseClientConfigStatus.storageInitialized,
      storageBucketEnvName: firebaseClientConfigStatus.storageBucketEnvName,
      storageBucketAcceptsFormats: firebaseClientConfigStatus.storageBucketAcceptsFormats,
      initializationError: firebaseClientConfigStatus.initializationError,
      storageInitializationError: firebaseClientConfigStatus.storageInitializationError,
      authUserPresent: Boolean(auth.user),
      ...details
    });
  }

  async function handleFile(file: File | undefined) {
    setError("");
    setErrorCode("");
    setRemovedNotice("");
    setPreviewFailed(false);
    if (!file) return;
    if (disabled) {
      setStatus("idle");
      setError("");
      setErrorCode("");
      setRemovedNotice("Media skipped for now.");
      resetFileInput();
      return;
    }
    retryFileRef.current = file;
    setPreview(file);
    setSelectedFile({ name: file.name, size: file.size, type: file.type || "unknown" });
    setStatus("preparing");
    setProgress(0);
    setUploadSpeed("");

    if (!storage) {
      setStatus("failed");
      const code = firebaseClientConfigStatus.storageConfigured ? "storage_misconfigured" : "storage_unavailable";
      setError(mediaErrorMessage(code));
      setErrorCode(code);
      logUploadDebug("blocked", { reason: code, uploadPath: storagePath });
      return;
    }
    if (!auth.user) {
      setStatus("failed");
      setError(mediaErrorMessage("unauthenticated"));
      setErrorCode("unauthenticated");
      logUploadDebug("blocked", { reason: "unauthenticated", uploadPath: storagePath });
      return;
    }

    const validation = validateMediaFile(file, kind, limitMb);
    if (!validation.ok) {
      setStatus("failed");
      setError(validation.message);
      setErrorCode(validation.code);
      logUploadDebug("validation_failed", { reason: validation.code, uploadPath: storagePath, contentType: file.type, size: file.size });
      return;
    }

    const path = appendUploadFileName(storagePath, file.name);
    setStatus("uploading");
    uploadStartedAtRef.current = Date.now();
    lastProgressAtRef.current = uploadStartedAtRef.current;
    lastBytesTransferredRef.current = 0;
    logUploadDebug("started", { uploadPath: path, contentType: file.type, size: file.size });
    try {
      const uploadTask = uploadBytesResumable(ref(storage, path), file, { contentType: file.type, customMetadata: { originalName: file.name, uploadedBy: auth.user.uid } });
      uploadTaskRef.current = uploadTask;
      const downloadUrl = await new Promise<string>((resolve, reject) => {
        let settled = false;
        const clearTimers = () => {
          window.clearTimeout(timer);
          window.clearInterval(stallTimer);
        };
        const failUpload = (error: unknown) => {
          if (settled) return;
          settled = true;
          clearTimers();
          reject(error);
        };
        const timer = window.setTimeout(() => failUpload(new Error("STORAGE_UPLOAD_TIMEOUT")), 120_000);
        const stallTimer = window.setInterval(() => {
          const noBytesTransferred = lastBytesTransferredRef.current <= 0;
          const stalled = Date.now() - lastProgressAtRef.current > 30_000;
          if (noBytesTransferred && stalled) {
            failUpload(new Error("STORAGE_UPLOAD_STALLED"));
            uploadTask.cancel();
          }
        }, 5_000);
        uploadTask.on("state_changed", (snapshot) => {
          const nextProgress = Math.round((snapshot.bytesTransferred / Math.max(snapshot.totalBytes, 1)) * 100);
          if (snapshot.bytesTransferred > lastBytesTransferredRef.current) {
            lastBytesTransferredRef.current = snapshot.bytesTransferred;
            lastProgressAtRef.current = Date.now();
          }
          setProgress(Math.max(0, Math.min(100, nextProgress)));
          const elapsedSeconds = Math.max((Date.now() - uploadStartedAtRef.current) / 1000, 0.25);
          setUploadSpeed(`${formatUploadBytes(snapshot.bytesTransferred / elapsedSeconds)}/s`);
        }, (caught) => {
          failUpload(caught);
        }, async () => {
          if (settled) return;
          settled = true;
          clearTimers();
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
      setUploadedFile({ path, fileName: file.name, contentType: file.type, size: file.size });
      setLocalPreview("");
      setSelectedFile(null);
      retryFileRef.current = null;
      uploadTaskRef.current = null;
      setStatus("complete");
      logUploadDebug("complete", { uploadPath: path, contentType: file.type, size: file.size });
      window.setTimeout(() => setStatusState((current) => current === "complete" ? "idle" : current), 2500);
    } catch (caught) {
      const classified = classifyStorageError(caught instanceof Error && caught.message === "PROCESSING_FAILED" ? new Error("processing failed") : caught);
      setStatus("failed");
      setError(classified.message);
      setErrorCode(classified.code);
      uploadTaskRef.current = null;
      if (value) {
        setPreview(null);
        setSelectedFile(null);
      }
      logUploadDebug("failed", { reason: classified.code, uploadPath: path, contentType: file.type, size: file.size });
    }
  }

  function remove() {
    const shouldRemove = !hasUploadedValue || window.confirm("Are you sure you want to remove this media?");
    if (!shouldRemove) return;
    retryFileRef.current = null;
    uploadTaskRef.current?.cancel();
    uploadTaskRef.current = null;
    setPreview(null);
    setSelectedFile(null);
    setUploadedFile(null);
    setStatus("idle");
    setProgress(0);
    setUploadSpeed("");
    setError("");
    setErrorCode("");
    setRemovedNotice(hasUploadedValue ? "Removed from this challenge. Stored file cleanup will be handled by the platform." : "");
    onChange("");
    resetFileInput();
  }

  function chooseAnotherFile() {
    resetFileInput();
    inputRef.current?.click();
  }

  function retry() {
    if (retryFileRef.current) void handleFile(retryFileRef.current);
  }

  const stageLabel = status === "preparing" ? "Preparing upload" : status === "processing" ? "Processing file" : status === "uploading" ? (progress > 0 ? "Uploading image" : "Starting upload") : status === "complete" ? "Upload complete" : status === "failed" ? "Upload failed" : value ? "Upload complete" : "Ready to upload";
  const stateCopy = status === "preparing" && progress === 0 ? "Preparing upload..." : status === "uploading" ? (progress > 0 ? `Uploading image... ${progress}%` : "Starting secure upload...") : status === "processing" ? "Processing file and saving media reference..." : status === "complete" || value ? "Upload complete." : status === "failed" ? "Upload failed. Review the reason below and retry when ready." : "Choose a file to upload.";

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm font-bold text-slate-300"><span>{label}</span>{required ? <span className="text-xs uppercase tracking-[0.14em] text-[var(--gold)]">Required</span> : null}</div>
      <Card className="border-white/10 bg-black/30 p-4">
        {displayUrl ? (
          <div className="overflow-hidden rounded-[8px] border border-white/10 bg-[#111]">
            {isVideo ? <video src={displayUrl} controls className="max-h-72 w-full object-cover" /> : !previewFailed ? <img src={displayUrl} alt={label} onError={() => setPreviewFailed(true)} className="max-h-72 w-full object-cover" /> : <div className="flex h-40 items-center justify-center text-sm font-bold text-slate-400">Preview unavailable. The uploaded media URL is saved.</div>}
          </div>
        ) : (
          <button type="button" onClick={chooseAnotherFile} disabled={disabled} className={`flex min-h-36 w-full flex-col items-center justify-center rounded-[8px] border border-dashed border-white/15 px-4 py-8 text-center ${disabled ? "cursor-not-allowed bg-[#101010] text-slate-500" : "bg-[#151515] text-slate-300 hover:border-[var(--gold)]/50 hover:text-[var(--gold)]"}`}>
            {kind === "video" ? <Video className="mb-3" /> : kind === "image" ? <ImageIcon className="mb-3" /> : <UploadCloud className="mb-3" />}
            <span className="font-black">{disabled ? "Media skipped for now" : buttonLabel ?? (kind === "video" ? "Upload Video" : kind === "image" ? "Upload Image" : "Upload Media")}</span>
            <span className="mt-2 text-xs text-slate-500">{disabled ? disabledReason : `${kind === "video" ? "MP4, WebM, or QuickTime" : kind === "image" ? "JPG, PNG, or WebP" : "JPG, PNG, WebP, MP4, WebM, or QuickTime"} - up to ${limitMb}MB`}</span>
          </button>
        )}
        <input ref={inputRef} className="hidden" type="file" accept={accept} disabled={disabled} onChange={(event) => void handleFile(event.target.files?.[0])} />
        {(uploading || status === "failed" || status === "complete" || value) ? (
          <div className="mt-4 rounded-[8px] border border-white/10 bg-black/25 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white">{displayFileName}</p>
                <p className="mt-1 text-xs text-slate-400">{displayFile ? formatUploadBytes(displayFileSize) : "File saved"}{uploading && uploadSpeed ? ` - ${uploadSpeed}` : ""}</p>
              </div>
              <span className={`w-fit rounded-full px-3 py-1 text-xs font-black ${status === "failed" ? "bg-red-500/10 text-red-200" : status === "complete" || value ? "bg-emerald-500/10 text-emerald-200" : "bg-yellow-500/10 text-yellow-100"}`}>{stageLabel}</span>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 text-xs font-bold text-slate-400"><span>{stateCopy}</span><span>{displayProgress}% uploaded</span></div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label={`${label} upload progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={displayProgress}>
              <div className={`h-full transition-all duration-300 ${status === "failed" ? "bg-red-500" : "bg-[var(--gold)]"}`} style={{ width: `${displayProgress}%` }} />
            </div>
          </div>
        ) : null}
        {status === "complete" || value ? <p className="mt-3 flex items-center gap-2 rounded-[8px] bg-emerald-500/10 p-3 text-sm font-bold text-emerald-200"><CheckCircle2 size={16} /> Upload complete. Media URL and storage path are ready to save.</p> : null}
        {disabled ? <p className="mt-3 rounded-[8px] border border-yellow-500/20 bg-yellow-500/5 p-3 text-sm font-bold text-yellow-100">Publishing without media. No upload request will be attempted.</p> : null}
        {value || localPreview ? <div className="mt-4 flex flex-wrap gap-3">{!disabled ? <Button type="button" variant="secondary" onClick={chooseAnotherFile}><UploadCloud size={16} /> {value ? "Replace" : "Choose Another File"}</Button> : null}<Button type="button" variant="ghost" onClick={remove}><Trash2 size={16} /> Remove</Button></div> : null}
        {status === "failed" && !disabled ? <div className="mt-3 flex flex-wrap gap-3"><Button type="button" variant="secondary" onClick={retry} disabled={!retryFileRef.current}><RotateCcw size={16} /> Retry Upload</Button><Button type="button" variant="ghost" onClick={chooseAnotherFile}><UploadCloud size={16} /> Choose Another File</Button></div> : null}
        {helperText ? <p className="mt-3 text-xs leading-5 text-slate-500">{helperText}</p> : null}
        {removedNotice ? <p className="mt-3 rounded-[8px] bg-slate-900 p-3 text-sm font-bold text-slate-200">{removedNotice}</p> : null}
        {error ? <div className="mt-3 rounded-[8px] bg-red-950/50 p-3 text-sm font-bold text-red-200" role="alert"><p className="flex items-center gap-2"><XCircle size={16} /> {error}</p>{errorCode ? <p className="mt-2 text-xs font-semibold text-red-200/70">Error code: {errorCode}</p> : null}</div> : null}
      </Card>
    </div>
  );
}
