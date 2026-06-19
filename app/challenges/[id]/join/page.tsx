"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { CheckCircle2, UploadCloud } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { Button, Card, Field, inputClass, LinkButton, PageTitle, textareaClass } from "@/components/ui";
import { fetchChallengeDetails, joinChallenge, submitEntry } from "@/lib/api/services";
import { normalizeChallenge, type ChallengeApiRecord } from "@/lib/api/normalizers";
import { storage } from "@/lib/firebase/client";
import { canJoinChallenge, getChallengeDisplayStatus } from "@/lib/challenge-status";

export default function JoinChallengePage() {
  const params = useParams<{ id: string }>();
  const challengeId = params.id;
  const auth = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["challenge-details", challengeId, auth.user?.uid ?? "signed-out"],
    queryFn: () => fetchChallengeDetails(challengeId),
    enabled: Boolean(challengeId) && !auth.loading,
    staleTime: 30_000
  });

  const details = data?.ok ? data.data : null;
  const rawChallenge = details?.challenge as (ChallengeApiRecord & Record<string, unknown>) | undefined;
  const currentChallenge = useMemo(() => rawChallenge ? normalizeChallenge(rawChallenge) : null, [rawChallenge]);
  const joinOpen = currentChallenge ? canJoinChallenge(currentChallenge) : false;
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
    if (!storage) {
      setError("Firebase Storage is not configured.");
      return;
    }
    if (unavailable) {
      setError("This challenge is not available for new entries.");
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
    const mediaType = file.type.startsWith("video/") ? "video" : "image";
    if (!currentChallenge.acceptedSubmissionTypes.includes(mediaType)) {
      setError(`This challenge accepts: ${currentChallenge.acceptedSubmissionTypes.join(", ")}.`);
      return;
    }

    setSubmitting(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `users/${auth.user.uid}/submissions/${currentChallenge.id}-${Date.now()}-${safeName}`;
      const uploadRef = ref(storage, path);
      await uploadBytes(uploadRef, file, { contentType: file.type });
      const mediaUrl = await getDownloadURL(uploadRef);

      const joinResult = await joinChallenge(currentChallenge.id);
      if (!joinResult.ok) throw new Error(joinResult.message);

      const submissionResult = await submitEntry({
        challengeId: currentChallenge.id,
        title,
        description,
        caption: description,
        mediaUrl,
        mediaType
      });
      if (!submissionResult.ok) throw new Error(submissionResult.message);

      setSubmitted(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Entry could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  if (auth.loading || isLoading) {
    return (
      <AppShell>
        <div className="grid max-w-6xl gap-8 xl:grid-cols-[.9fr_1.1fr]">
          <Card className="h-80 animate-pulse p-7" />
          <Card className="h-96 animate-pulse p-8" />
        </div>
      </AppShell>
    );
  }

  if (data && !data.ok) {
    const notFound = data.message.toLowerCase().includes("not found");
    return (
      <AppShell>
        <Card className="mx-auto max-w-2xl p-10 text-center">
          <h1 className="text-4xl font-black">{notFound ? "Challenge Not Found" : "Challenge Unavailable"}</h1>
          <p className="mt-3 text-slate-300">{data.message}</p>
          <LinkButton href="/challenges" className="mt-8">Back to Challenges</LinkButton>
        </Card>
      </AppShell>
    );
  }

  if (!currentChallenge) {
    return (
      <AppShell>
        <Card className="mx-auto max-w-2xl p-10 text-center">
          <h1 className="text-4xl font-black">Challenge Not Found</h1>
          <p className="mt-3 text-slate-300">This challenge does not exist or is not available.</p>
          <LinkButton href="/challenges" className="mt-8">Back to Challenges</LinkButton>
        </Card>
      </AppShell>
    );
  }

  if (submitted) {
    return (
      <AppShell>
        <Card className="mx-auto max-w-2xl p-10 text-center">
          <CheckCircle2 className="mx-auto h-20 w-20 text-emerald-400" />
          <h1 className="mt-6 text-4xl font-black">Entry Submitted</h1>
          <p className="mt-3 text-slate-300">You joined {currentChallenge.title}. Your participant status and submission are now recorded.</p>
          <LinkButton href={`/challenges/${currentChallenge.id}`} className="mt-8">View Challenge</LinkButton>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="grid max-w-6xl gap-8 xl:grid-cols-[.9fr_1.1fr]">
        <Card className="p-7">
          <PageTitle title="Challenge Entry" subtitle={currentChallenge.title} />
          <p className="mt-5 text-slate-300">{currentChallenge.description}</p>
          <div className="mt-6 space-y-3 text-slate-200">
            <p><b>Deadline:</b> {currentChallenge.registrationDeadline}</p>
            <p><b>Prize pool:</b> {currentChallenge.prizeType === "Bragging Rights (Leaderboard Ranking)" ? "Leaderboard ranking" : `$${currentChallenge.prizePool.toLocaleString()}`}</p>
            <p><b>Entry fee:</b> {currentChallenge.entryFee ? `$${currentChallenge.entryFee}` : "Free"}</p>
          </div>
          <h2 className="mt-8 text-xl font-black">Rules</h2>
          {currentChallenge.rules.length ? currentChallenge.rules.map((rule) => <p key={rule.id} className="mt-3 text-sm text-slate-300">- {rule.editableText}</p>) : <p className="mt-3 text-sm text-slate-300">Rules have not been published for this challenge yet.</p>}
        </Card>
        <Card className="p-8">
          <h2 className="text-2xl font-black">Upload Submission</h2>
          {!auth.user ? <Card className="mt-5 border-slate-600 bg-slate-900/60 p-4 text-slate-300">Sign in before joining this challenge. <LinkButton href="/auth/login" variant="ghost" className="mt-4">Sign In</LinkButton></Card> : null}
          {!joinOpen ? <Card className="mt-5 border-slate-600 bg-slate-900/60 p-4 text-slate-300">Registration is closed for this challenge. Current status: {displayStatus}.</Card> : null}
          {isPrivate ? <Card className="mt-5 border-yellow-500/30 bg-yellow-950/10 p-4 text-[var(--gold)]">This private challenge requires invite or approval before entry.</Card> : null}
          {isFull ? <Card className="mt-5 border-slate-600 bg-slate-900/60 p-4 text-slate-300">This challenge is full.</Card> : null}
          <form className="mt-6 space-y-5" onSubmit={submit}>
            <Field label="Submission Title"><input name="title" className={inputClass} required placeholder="Give your entry a title" /></Field>
            <Field label="Caption / Description"><textarea name="description" className={textareaClass} required placeholder="Describe your submission" /></Field>
            <Field label={`Upload ${currentChallenge.acceptedSubmissionTypes.join(" or ")}`}><input name="media" className={inputClass} type="file" accept={currentChallenge.acceptedSubmissionTypes.map((type) => `${type}/*`).join(",")} required /></Field>
            <label className="flex items-start gap-3 font-bold"><input className="mt-1" type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} /> I accept the challenge rules, voting policy, prize terms, and fee acknowledgement where applicable.</label>
            {error ? <p className="rounded-[8px] bg-red-950/50 p-3 text-red-200">{error}</p> : null}
            <Button className="w-full" disabled={!auth.user || unavailable || submitting}><UploadCloud size={17} /> {submitting ? "Submitting Entry" : unavailable ? "Unavailable" : "Submit Entry"}</Button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
