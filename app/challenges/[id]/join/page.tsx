"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, UploadCloud } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { MediaUploadField, type MediaUploadStage } from "@/components/media-upload-field";
import { Button, Card, Field, inputClass, LinkButton, PageTitle, textareaClass } from "@/components/ui";
import { fetchChallengeDetails, joinChallenge, submitEntry } from "@/lib/api/services";
import { normalizeChallenge, type ChallengeApiRecord } from "@/lib/api/normalizers";
import { firebaseClientConfigStatus } from "@/lib/firebase/client";
import { mediaErrorMessage, type MediaUploadKind } from "@/lib/media-upload";
import { submissionFolderForMediaType, submissionMediaPath } from "@/lib/media-upload-paths";
import { getChallengeLifecycleState, getChallengeDisplayStatus } from "@/lib/challenge-status";

type UploadedSubmissionMedia = { url: string; path: string; fileName: string; size: number; contentType: string; mediaType: "image" | "video" };

function SubmissionUploadField({ challengeId, userId, acceptedSubmissionTypes, value, disabled, onStatusChange, onUploaded }: { challengeId: string; userId: string; acceptedSubmissionTypes: string[]; value: string; disabled: boolean; onStatusChange: (status: MediaUploadStage) => void; onUploaded: (media: UploadedSubmissionMedia | null) => void }) {
  const mediaKind: MediaUploadKind = acceptedSubmissionTypes.length > 1 ? "media" : acceptedSubmissionTypes[0] === "video" ? "video" : "image";
  const pathMediaType = mediaKind === "video" ? "video" : "image";
  const disabledReason = disabled
    ? "Participant media submission requires Firebase Storage. Uploads are not available in storage-disabled demo mode."
    : mediaErrorMessage("storage_unavailable");
  return <MediaUploadField
    label={`Upload ${acceptedSubmissionTypes.join(" or ")}`}
    value={value}
    onChange={(url, metadata) => {
      if (!url || !metadata) {
        onUploaded(null);
        return;
      }
      const mediaType = metadata.contentType.startsWith("video/") ? "video" : "image";
      onUploaded({ url, path: metadata.path, fileName: metadata.fileName, size: metadata.size, contentType: metadata.contentType, mediaType });
    }}
    storagePath={submissionMediaPath(challengeId, userId, submissionFolderForMediaType(pathMediaType))}
    kind={mediaKind}
    buttonLabel="Upload submission media"
    required
    disabled={disabled}
    disabledReason={disabledReason}
    onStatusChange={onStatusChange}
    helperText="Your submission media is saved only after Firebase Storage confirms the upload and returns a media URL."
  />;
}

export default function JoinChallengePage() {
  const params = useParams<{ id: string }>();
  const challengeId = params.id;
  const auth = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successSubmission, setSuccessSubmission] = useState<{ id?: string; title: string; pendingMedia?: boolean; status?: string } | null>(null);
  const [submissionMedia, setSubmissionMedia] = useState<UploadedSubmissionMedia | null>(null);
  const [uploadStatus, setUploadStatus] = useState<MediaUploadStage>("idle");
  const [entryCheckoutLoading, setEntryCheckoutLoading] = useState(false);
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
  const monetization = rawChallenge?.monetization && typeof rawChallenge.monetization === "object" ? rawChallenge.monetization as Record<string, unknown> : {};
  const entryFeeCents = Number(monetization.entryFeeAmountCents ?? rawChallenge?.entryFeeAmountCents ?? rawChallenge?.entryFeeCents ?? 0);
  const paidEntryRequired = Boolean((monetization as any).paidEntryRequested || rawChallenge?.paidEntryEnabled || rawChallenge?.entryFeeRequired) && entryFeeCents > 0;
  const entryFeeLabel = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.max(0, entryFeeCents) / 100);
  const userState = details?.userState as Record<string, unknown> | undefined;
  const entryPaymentStatus = String(userState?.entryPaymentStatus ?? "not_started");
  const paidEntryEnrolled = Boolean(userState?.paidEntryEnrolled || ["paid", "confirmed"].includes(entryPaymentStatus));
  const paidEntryPending = Boolean(userState?.entryPaymentPending || entryPaymentStatus === "pending");
  const authProfile = auth.user as ({ accountType?: string; role?: string } & typeof auth.user) | null;
  const sponsorAccount = authProfile?.accountType === "sponsor" || authProfile?.role === "sponsor";
  const unavailable = !joinOpen || isFull || isPrivate || ["cancelled", "rejected"].includes(String(rawChallenge?.status ?? ""));


  async function startPaidEntryCheckout() {
    setError("");
    if (!auth.user) {
      setError("Sign in before paying the entry fee.");
      return;
    }
    setEntryCheckoutLoading(true);
    const result = await fetch(`/api/challenges/${challengeId}/entry-checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entryAgreementAccepted: true })
    }).then((response) => response.json()).catch(() => ({ ok: false, message: "Paid entry checkout could not start." }));
    setEntryCheckoutLoading(false);
    if (!result.ok || !result.data?.url) {
      setError(result.message ?? "Paid entry checkout could not start.");
      return;
    }
    window.location.href = result.data.url;
  }
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
    if (paidEntryRequired && !paidEntryEnrolled) {
      setError("Pay the entry fee before submitting your entry.");
      return;
    }
    if (unavailable) {
      setError(lifecycle?.disabledReason ?? lifecycle?.userFacingMessage ?? "This challenge is not available for new entries.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    if (!title) {
      setError("Submission title is required.");
      return;
    }
    if (!description) {
      setError("Caption / description is required.");
      return;
    }
    if (firebaseClientConfigStatus.mediaUploadsDisabled) {
      setError("Participant media submission requires Firebase Storage. Uploads are not available in storage-disabled demo mode.");
      return;
    }
    if (["preparing", "uploading", "processing"].includes(uploadStatus)) {
      setError("Please wait for your media upload to finish.");
      return;
    }
    if (uploadStatus === "failed") {
      setError("Please retry the failed media upload before submitting.");
      return;
    }
    if (!submissionMedia?.url || !submissionMedia.path) {
      setError("Upload an accepted media file before submitting.");
      return;
    }
    if (!currentChallenge.acceptedSubmissionTypes.includes(submissionMedia.mediaType)) {
      setError(`This challenge accepts: ${currentChallenge.acceptedSubmissionTypes.join(", ")}.`);
      return;
    }

    setSubmitting(true);
    try {
      const joinResult = await joinChallenge(currentChallenge.id, { entryAgreementAccepted: true });
      if (!joinResult.ok) throw new Error(joinResult.message);

      const submissionResult = await submitEntry({
        challengeId: currentChallenge.id,
        title,
        description,
        caption: description,
        mediaUrl: submissionMedia.url,
        mediaType: submissionMedia.mediaType,
        mediaUploadPending: false,
        originalFileName: submissionMedia.fileName,
        fileSize: submissionMedia.size,
        mediaStoragePath: submissionMedia.path,
        entryAgreementAccepted: true,
        rulesAccepted: true
      });
      if (!submissionResult.ok) throw new Error(submissionResult.message);

      const submission = submissionResult.data?.submission as { id?: string; status?: string } | undefined;
      setSuccessSubmission({ id: submission?.id, title, pendingMedia: false, status: submission?.status });
      setSubmitted(true);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Entry could not be submitted.";
      setError(message);
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
                    {paidEntryRequired && !paidEntryEnrolled ? <Card className="mt-5 border-[var(--gold)]/30 bg-[var(--gold)]/10 p-4 text-sm text-yellow-50"><h3 className="font-black">Entry fee required</h3><p className="mt-2 text-slate-200">Pay the {entryFeeLabel} entry fee before submitting your entry. Checkout success does not unlock submission until Stripe webhook confirmation updates your enrollment.</p>{sponsorAccount ? <p className="mt-3 rounded-[8px] bg-black/30 p-3 text-red-200">Sponsor accounts cannot Pay & Enroll or submit entries.</p> : paidEntryPending ? <Button className="mt-4 w-full" disabled>Payment Processing...</Button> : <Button className="mt-4 w-full" onClick={() => void startPaidEntryCheckout()} disabled={!auth.user || unavailable || entryCheckoutLoading}>{entryCheckoutLoading ? "Starting Checkout..." : `Pay Entry Fee - ${entryFeeLabel}`}</Button>}</Card> : null}
          <form className="mt-6 space-y-5" onSubmit={submit}>
            <Field label="Submission Title"><input name="title" className={inputClass} required placeholder="Give your entry a title" /></Field>
            <Field label="Caption / Description"><textarea name="description" className={textareaClass} required placeholder="Describe your submission" /></Field>
            <SubmissionUploadField challengeId={currentChallenge.id} userId={auth.user?.uid ?? "anonymous"} acceptedSubmissionTypes={currentChallenge.acceptedSubmissionTypes} value={submissionMedia?.url ?? ""} disabled={!auth.user || firebaseClientConfigStatus.mediaUploadsDisabled} onStatusChange={setUploadStatus} onUploaded={(media) => { setSubmissionMedia(media); setError(""); }} />
            <label className="flex items-start gap-3 font-bold leading-6"><input className="mt-1 shrink-0" type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} /> <span>I accept the challenge rules, voting policy, and prize terms. Paid-entry prize pools and payouts are not available yet.</span></label>
            {error ? <p className="rounded-[8px] bg-red-950/50 p-3 text-red-200">{error}</p> : null}
            <Button className="w-full" disabled={!auth.user || unavailable || (paidEntryRequired && !paidEntryEnrolled) || submitting || ["preparing", "uploading", "processing"].includes(uploadStatus)}><UploadCloud size={17} /> {submitting ? "Submitting Entry" : ["preparing", "uploading", "processing"].includes(uploadStatus) ? "Waiting for Upload" : paidEntryRequired && !paidEntryEnrolled ? "Pay Entry Fee First" : unavailable ? lifecycle?.actionLabel ?? "Unavailable" : "Submit Entry"}</Button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}


