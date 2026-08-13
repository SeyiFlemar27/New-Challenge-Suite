"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ApiErrorPanel } from "@/components/api-error-panel";
import { ChallengeMediaGallery } from "@/components/media-display";
import { Button, Card, LinkButton } from "@/components/ui";
import { fetchChallengeDraft, publishChallengeDraft } from "@/lib/api/services";
import { challengePublishError } from "@/lib/challenge-publish-feedback";
import { formatChallengeDateTime, resolveChallengeTimeZone } from "@/lib/challenge-date-time";

type Draft = Record<string, any>;

export default function ChallengeDraftPreviewPage() {
  const { draftId } = useParams<{ draftId: string }>();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => { void fetchChallengeDraft(draftId).then((result) => { setLoading(false); if (!result.ok || !result.data?.challenge) return setError(result.status === 401 ? "Your session expired. Please sign in again." : "Preview could not be loaded."); setDraft(result.data.challenge); }); }, [draftId]);
  const timeZone = useMemo(() => resolveChallengeTimeZone(draft ?? {}), [draft]);
  async function publish() { if (!draft) return; setPublishing(true); setError(""); const result = await publishChallengeDraft(draftId, { ...draft, publish: true }); setPublishing(false); if (!result.ok) return setError(challengePublishError(result)); setSubmitted(true); }
  if (submitted) return <AppShell><Card className="mx-auto max-w-2xl p-8 text-center"><h1 className="text-3xl font-black">Challenge submitted for review.</h1><p className="mt-3 text-slate-300">We'll notify you when it's approved.</p><div className="mt-7 flex flex-wrap justify-center gap-3"><LinkButton href={`/challenges/${draftId}`}>View Challenge</LinkButton><LinkButton href="/dashboard" variant="secondary">Back to Dashboard</LinkButton><LinkButton href="/challenges/create" variant="secondary">Create Another Challenge</LinkButton></div></Card></AppShell>;
  return <AppShell>
    <div className="sticky top-[69px] z-30 -mx-4 mb-6 border-y border-white/10 bg-[#111]/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-10 lg:px-10" data-preview-mode-bar><div className="mx-auto flex min-h-10 max-w-[1240px] flex-wrap items-center justify-between gap-2"><span className="text-xs font-black uppercase tracking-[0.14em] text-[var(--gold)]">Preview mode</span><div className="flex gap-2"><Button variant="ghost" className="min-h-9 px-3 py-1.5 text-xs" onClick={() => router.push(`/challenges/create/${draftId}`)}>Back to Editing</Button><Button className="min-h-9 px-3 py-1.5 text-xs" disabled={publishing || !draft} onClick={publish}>{publishing ? "Submitting..." : "Publish Challenge"}</Button></div></div></div>
    {loading ? <div className="mx-auto max-w-[1240px] space-y-5"><div className="aspect-video animate-pulse rounded-[8px] bg-white/5" /><div className="h-12 w-2/3 animate-pulse rounded bg-white/5" /></div> : null}
    {error ? <div className="mx-auto max-w-[1240px]"><ApiErrorPanel message={error} onRetry={() => setError("")} /></div> : null}
    {draft ? <article className="mx-auto grid max-w-[1240px] gap-7 xl:grid-cols-[minmax(0,1fr)_340px]" data-public-style-preview><div className="min-w-0 space-y-7"><ChallengeMediaGallery title={String(draft.title || "Challenge preview")} videoUrl={draft.trailerVideoUrl || draft.promoVideoUrl} images={[draft.coverImageUrl, draft.promoImageUrl, draft.galleryImageUrl]} /><div><span className="rounded-full bg-[var(--gold)]/10 px-3 py-2 text-xs font-black text-[var(--gold)]">{String(draft.category || "Uncategorized")}</span><h1 className="mt-5 break-words text-3xl font-black sm:text-5xl">{String(draft.title || "Untitled challenge")}</h1><p className="mt-3 text-sm text-slate-400">Hosted by {String(draft.creatorDisplayName || draft.hostDisplayName || "Challenge creator")}</p></div><PreviewSection title="About" body={String(draft.description || "Add a challenge description.")} /><PreviewSection title="Rules & eligibility" body={String(draft.standardRules || draft.policyTerms || "Add challenge rules.")} /><PreviewSection title="Entry & submission" body={String(draft.challengeGuidelines || "Add submission instructions.")} /></div><aside className="space-y-5 xl:sticky xl:top-24 xl:h-fit"><Card className="p-5"><p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--gold)]">Draft preview</p><p className="mt-3 text-sm leading-6 text-slate-300">Actions are disabled in preview. Publishing submits this draft for admin review.</p><Button className="mt-5 w-full" disabled>Preview only</Button></Card><Card className="p-5"><h2 className="font-black">Timeline</h2><Timeline label="Registration closes" value={draft.registrationDeadline} timeZone={timeZone} /><Timeline label="Challenge starts" value={draft.submissionStartAt || draft.startsAt} timeZone={timeZone} /><Timeline label="Submission deadline" value={draft.submissionDeadline} timeZone={timeZone} /><Timeline label="Voting/review closes" value={draft.votingDeadline || draft.votingEndsAt} timeZone={timeZone} /></Card></aside></article> : null}
  </AppShell>;
}

function PreviewSection({ title, body }: { title: string; body: string }) { return <Card className="p-5 sm:p-7"><h2 className="text-xl font-black">{title}</h2><p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-300">{body}</p></Card>; }
function Timeline({ label, value, timeZone }: { label: string; value: unknown; timeZone: string }) { return value ? <div className="mt-4 border-t border-white/10 pt-4"><p className="text-xs font-bold text-slate-400">{label}</p><p className="mt-1 text-sm font-black">{formatChallengeDateTime(value as string, timeZone)}</p></div> : null; }
