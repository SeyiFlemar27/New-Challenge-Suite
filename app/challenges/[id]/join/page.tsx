"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { CheckCircle2, UploadCloud } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { Button, Card, Field, inputClass, LinkButton, PageTitle, textareaClass } from "@/components/ui";
import { fetchChallengeDetails, joinChallenge, submitEntry } from "@/lib/api/services";
import { normalizeChallenge, type ChallengeApiRecord } from "@/lib/api/normalizers";
import { storage } from "@/lib/firebase/client";
import { appendUploadFileName, classifyStorageError, validateMediaFile } from "@/lib/media-upload";
import { getChallengeLifecycleState, getChallengeDisplayStatus } from "@/lib/challenge-status";

export default function JoinChallengePage() {
  const params = useParams<{ id: string }>();
  const challengeId = params.id;
  const auth = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successSubmission, setSuccessSubmission] = useState<{ id?: string; title: string; pendingMedia?: boolean; status?: string } | null>(null);
  const [selectedMediaPreview, setSelectedMediaPreview] = useState("");
  const [selectedMediaType, setSelectedMediaType] = useState<"image" | "video" | "">("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const { data, isLoading } = useQuery({
    queryKey: ["challenge-details", challengeId, auth.user?.uid ?? "signed-out"],
    queryFn: () => fetchChallengeDetails(challengeId),
    enabled: Boolean(challengeId) && !auth.loading,
    staleTime: 30_000
  });

  const details = data?.ok ? data.data : null;
  const rawChallenge = details?.challenge as (ChallengeApiRecord & Record<string, unknown>) | undefined;
  const currentChallenge = useMemo(() => rawChallenge ? normalizeChallenge(rawChallenge) : null, [rawChallenge]);
  const lifecycle = currentChallenge ? getChallengeLifecycleState(currentChallenge) : null;
  const joinOpen = lifecycle?.canJoin ?? false;
  const displayStatus = currentChallenge ? getChallengeDisplayStatus(currentChallenge) : "";
  const maxParticipants = typeof rawChallenge?.maxParticipants === "number" ? rawChallenge.maxParticipants : null;
  const isFull = Boolean(maxParticipants && currentChallenge && currentChallenge.participants >= maxParticipants);
  const isPrivate = currentChallenge?.type === "Private / Exclusive" && !details?.userState.joined;
  const unavailable = !joinOpen || isFull || isPrivate || ["cancelled", "rejected"].includes(String(rawChallenge?.status ?? ""));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!auth.user) {
      setError("Sign in before joining this challenge.");
      return;
    }
    if (!currentChallenge) return;
    if (!agreed) {
      setError("Accept the challenge rules before submitting.");
      return;
    }
    if (unavailable) {
      setError(lifecycle?.disabledReason ?? lifecycle?.userFacingMessage ?? "This challenge is not available for new entries.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const file = formData.get("media");
    if (!title) {
      setError("Submission title is required.");
      return;
    }
    if (!description) {
      setError("Caption / description is required.");
      return;
    }
    if (!(file instanceof File) || !file.name) {
      setError("Upload an accepted media file before submitting.");
      return;
    }
    const mediaKind = currentChallenge.acceptedSubmissionTypes.length > 1 ? "media" : currentChallenge.acceptedSubmissionTypes[0] === "video" ? "video" : "image";
    const validation = validateMediaFile(file, mediaKind);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    const mediaType = validation.mediaType;
    if (!currentChallenge.acceptedSubmissionTypes.includes(mediaType)) {
      setError(`This challenge accepts: ${currentChallenge.acceptedSubmissionTypes.join(", ")}.`);
      return;
    }

    setSubmitting(true);
    try {
      let mediaUrl = "";
      let mediaStoragePath = "";
      let pendingMedia = false;
      if (storage) {
        const path = appendUploadFileName(`challenges/${currentChallenge.id}/submissions/${auth.user.uid}`, file.name);
        mediaStoragePath = path;
        const uploadRef = ref(storage, path);
        const uploadTask = uploadBytesResumable(uploadRef, file, { contentType: file.type, customMetadata: { originalName: file.name } });
        mediaUrl = await new Promise<string>((resolve, reject) => {
          const timer = window.setTimeout(() => reject(new Error("STORAGE_UPLOAD_TIMEOUT")), 90_000);
          uploadTask.on("state_changed", (snapshot) => {
            setUploadProgress(Math.round((snapshot.bytesTransferred / Math.max(snapshot.totalBytes, 1)) * 100));
          }, (caught) => {
            window.clearTimeout(timer);
            reject(caught);
          }, async () => {
            window.clearTimeout(timer);
            resolve(await getDownloadURL(uploadTask.snapshot.ref));
          });
        });
      } else {
        pendingMedia = true;
      }

      const joinResult = await joinChallenge(currentChallenge.id, { entryAgreementAccepted: true });
      if (!joinResult.ok) throw new Error(joinResult.message);

      const submissionResult = await submitEntry({
        challengeId: currentChallenge.id,
        title,
        description,
        caption: description,
        mediaUrl,
        mediaType,
        mediaUploadPending: pendingMedia,
        originalFileName: file.name,
        fileSize: file.size,
        mediaStoragePath,
        entryAgreementAccepted: true,
        rulesAccepted: true
      });
      if (!submissionResult.ok) throw new Error(submissionResult.message);

      const submission = submissionResult.data?.submission as { id?: string; status?: string } | undefined;
      setSuccessSubmission({ id: submission?.id, title, pendingMedia, status: submission?.status });
      setSubmitted(true);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Entry could not be submitted.";
      const storageFailure = message === "STORAGE_UPLOAD_TIMEOUT" || /storage|bucket|processing failed|network|offline/i.test(message);
      setError(storageFailure ? classifyStorageError(caught).message : message);
    } finally {
      setSubmitting(false);
    }
  }

  if (auth.loading || isLoading) {
    return (
      <AppShell>
        <div className="grid max-w-6xl gap-6 lg:gap-8 xl:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
          <Card className="h-72 animate-pulse p-5 sm:h-80 sm:p-7" />
          <Card className="h-96 animate-pulse p-5 sm:p-8" />
        </div>
      </AppShell>
    );
  }

  if (data && !data.ok) {
    const notFound = data.message.toLowerCase().includes("not found");
    return (
      <AppShell>
        <Card className="mx-auto max-w-2xl p-6 text-center sm:p-8 lg:p-10">
          <h1 className="text-3xl font-black sm:text-4xl">{notFound ? "Challenge Not Found" : "Challenge Unavailable"}</h1>
          <p className="mt-3 text-slate-300">{data.message}</p>
          <LinkButton href="/challenges" className="mt-8 w-full sm:w-auto">Back to Challenges</LinkButton>
        </Card>
      </AppShell>
    );
  }

  if (!currentChallenge) {
    return (
      <AppShell>
        <Card className="mx-auto max-w-2xl p-6 text-center sm:p-8 lg:p-10">
          <h1 className="text-3xl font-black sm:text-4xl">Challenge Not Found</h1>
          <p className="mt-3 text-slate-300">This challenge does not exist or is not available.</p>
          <LinkButton href="/challenges" className="mt-8 w-full sm:w-auto">Back to Challenges</LinkButton>
        </Card>
      </AppShell>
    );
  }

  if (submitted) {
    return (
      <AppShell>
        <Card className="mx-auto max-w-2xl p-6 text-center sm:p-8 lg:p-10">
          <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-400 sm:h-20 sm:w-20" />
          <h1 className="mt-6 text-3xl font-black sm:text-4xl">Submission received</h1>
          <p className="mt-3 text-slate-300"><b>{successSubmission?.title}</b> was recorded for {currentChallenge.title}.</p>
          <p className="mt-3 text-slate-400">{successSubmission?.pendingMedia ? "Media upload is pending storage configuration. Your submission metadata is saved and ready to be completed." : successSubmission?.status === "active" || successSubmission?.status === "approved" ? "Your media was uploaded and the submission is live." : "Your media was uploaded and the submission is pending review."}</p>
          <div className="mt-8 grid gap-3 sm:flex sm:flex-wrap sm:justify-center">
            <LinkButton href={`/challenges/${currentChallenge.id}`} className="w-full sm:w-auto">View Challenge</LinkButton>
            <LinkButton href="/my-challenges" variant="secondary" className="w-full sm:w-auto">View My Submissions</LinkButton>
            <LinkButton href="/dashboard" variant="ghost" className="w-full sm:w-auto">Go to Dashboard</LinkButton>
          </div>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="grid max-w-6xl gap-6 lg:gap-8 xl:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
        <Card className="p-5 sm:p-7">
          <PageTitle title="Challenge Entry" subtitle={currentChallenge.title} />
          <p className="mt-5 break-words text-slate-300">{currentChallenge.description}</p>
          <div className="mt-6 space-y-3 text-slate-200">
            <p><b>Deadline:</b> {currentChallenge.registrationDeadline}</p>
            <p><b>Prize details:</b> {currentChallenge.prizeType === "Bragging Rights (Leaderboard Ranking)" ? "Leaderboard ranking" : "Pending review. Prize release is not available yet."}</p>
            <p><b>Entry fee:</b> Paid-entry prize pools are not available yet.</p>
          </div>
          <h2 className="mt-8 text-xl font-black">Rules</h2>
          {currentChallenge.rules.length ? currentChallenge.rules.map((rule) => <p key={rule.id} className="mt-3 text-sm text-slate-300">- {rule.editableText}</p>) : <p className="mt-3 text-sm text-slate-300">Rules have not been published for this challenge yet.</p>}
        </Card>
        <Card className="p-5 sm:p-8">
          <h2 className="text-xl font-black sm:text-2xl">Upload Submission</h2>
          {!auth.user ? <Card className="mt-5 border-slate-600 bg-slate-900/60 p-4 text-slate-300">Sign in before joining this challenge. <LinkButton href="/auth/login" variant="ghost" className="mt-4 w-full sm:w-auto">Sign In</LinkButton></Card> : null}
          {!joinOpen ? <Card className="mt-5 border-slate-600 bg-slate-900/60 p-4 text-slate-300">{lifecycle?.disabledReason ?? lifecycle?.userFacingMessage ?? `This challenge is not open for entries. Current status: ${displayStatus}.`}</Card> : null}
          {isPrivate ? <Card className="mt-5 border-yellow-500/30 bg-yellow-950/10 p-4 text-[var(--gold)]">This private challenge requires invite or approval before entry.</Card> : null}
          {isFull ? <Card className="mt-5 border-slate-600 bg-slate-900/60 p-4 text-slate-300">This challenge is full.</Card> : null}
          <form className="mt-6 space-y-5" onSubmit={submit}>
            <Field label="Submission Title"><input name="title" className={inputClass} required placeholder="Give your entry a title" /></Field>
            <Field label="Caption / Description"><textarea name="description" className={textareaClass} required placeholder="Describe your submission" /></Field>
            <Field label={`Upload ${currentChallenge.acceptedSubmissionTypes.join(" or ")}`}><input name="media" className={`${inputClass} file:mr-3 file:rounded-[6px] file:border-0 file:bg-[var(--gold)] file:px-3 file:py-2 file:text-sm file:font-black file:text-black`} type="file" accept={currentChallenge.acceptedSubmissionTypes.map((type) => `${type}/*`).join(",")} required onChange={(event) => { const file = event.target.files?.[0]; if (selectedMediaPreview) URL.revokeObjectURL(selectedMediaPreview); setSelectedMediaPreview(file ? URL.createObjectURL(file) : ""); setSelectedMediaType(file?.type.startsWith("video/") ? "video" : file ? "image" : ""); setUploadProgress(0); }} /></Field>{selectedMediaPreview ? <div className="overflow-hidden rounded-[8px] border border-white/10 bg-[#111]">{selectedMediaType === "video" ? <video src={selectedMediaPreview} controls className="max-h-72 w-full object-cover" /> : <img src={selectedMediaPreview} alt="Submission preview" className="max-h-72 w-full object-cover" />}</div> : null}{submitting && uploadProgress > 0 ? <div><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[var(--gold)] transition-all" style={{ width: `${uploadProgress}%` }} /></div><p className="mt-2 text-xs font-bold text-slate-400">Uploading media {uploadProgress}%</p></div> : null}
            <label className="flex items-start gap-3 font-bold leading-6"><input className="mt-1 shrink-0" type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} /> <span>I accept the challenge rules, voting policy, and prize terms. Paid-entry prize pools and payouts are not available yet.</span></label>
            {error ? <p className="rounded-[8px] bg-red-950/50 p-3 text-red-200">{error}</p> : null}
            <Button className="w-full" disabled={!auth.user || unavailable || submitting}><UploadCloud size={17} /> {submitting ? "Submitting Entry" : unavailable ? lifecycle?.actionLabel ?? "Unavailable" : "Submit Entry"}</Button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}


