import { getAdminDb } from "@/lib/firebase/admin";
import { fail, ok, serverUnavailable } from "@/lib/server/responses";
import { isPublicPrivatePreviewRecord, challengeMediaDeliveryUrl } from "@/lib/server/challenge-media-delivery";
import { privateLockedPreview, privatePublicVotingOpen } from "@/lib/private-challenge-policy";
import { canSubmissionReceiveVotes } from "@/lib/server/submission-lifecycle";
import { getActiveEconomyRules } from "@/lib/server/economy-rules";
import { DOROCOIN_COST_PER_VOTE } from "@/lib/server/voting";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Private preview");
  const snapshot = await db.collection("challenges").doc(id).get();
  const challenge = { id, ...snapshot.data() } as Record<string, unknown>;
  if (!snapshot.exists || !isPublicPrivatePreviewRecord(challenge)) return fail("Private challenge is restricted.", 404);
  const preview = privateLockedPreview(challenge);
  const submissions = privatePublicVotingOpen(challenge) ? await db.collection("submissions").where("challengeId", "==", id).limit(200).get() : null;
  const settings = challenge.votingSettings && typeof challenge.votingSettings === "object" ? challenge.votingSettings as Record<string, unknown> : {};
  const economy = submissions ? await getActiveEconomyRules(db) : null;
  const result = ok({ challenge: { ...preview, coverImage: challenge.coverImagePath ? challengeMediaDeliveryUrl(String(challenge.coverImagePath)) : "" },
    voting: { free: Boolean(submissions && settings.allowFreeVotes !== false), dorocoin: Boolean(submissions && economy?.voting.paidVotingEnabled && challenge.paidVotingDisabledByAdmin !== true && (settings.allowPaidVotes === undefined ? settings.allowDoroCoinVotes !== false : settings.allowPaidVotes !== false)), doroCoinCost: DOROCOIN_COST_PER_VOTE },
    submissions: submissions?.docs.filter((doc) => canSubmissionReceiveVotes(doc.data().status) && doc.data().visibility === "public" && doc.data().leaderboardEligible === true).map((doc) => ({ id: doc.id, title: String(doc.data().title ?? "Submission"), mediaUrl: doc.data().mediaPath ? challengeMediaDeliveryUrl(String(doc.data().mediaPath)) : "", mediaType: String(doc.data().mediaType ?? "") })) ?? [] }, "Locked preview loaded.");
  result.headers.set("Cache-Control", "no-store, private");
  return result;
}
