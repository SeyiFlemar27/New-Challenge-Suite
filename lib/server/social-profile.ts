import type { Firestore } from "firebase-admin/firestore";
import { getEffectiveTier, getUserPlanAccess } from "@/lib/plan-access";
import { toPublicProfile } from "@/lib/server/public-profile";
import { isPublicChallenge, isPublicSubmission, isQaDemoOrPlaceholderProfile, isQaOrDemoRecord, publicChallengeFields, publicSubmissionFields } from "@/lib/server/public-challenge";
import { isDemoProfileContent, isExplicitDemoEnvironment } from "@/lib/profile-identity";
import { calculateCreatorLevel } from "@/lib/server/economy-rules";
import { canViewProfileConnections, profilePrivacySettings } from "@/lib/server/profile-privacy";

export async function findProfileByUsername(db: Firestore, username: string) {
  const normalized = username.replace(/^@/, "").trim().toLowerCase();
  const query = await db.collection("profiles").where("usernameNormalized", "==", normalized).limit(1).get();
  if (query.docs[0]) return query.docs[0];
  const legacy = await db.collection("profiles").where("username", "==", normalized).limit(1).get();
  if (legacy.docs[0]) return legacy.docs[0];
  const direct = await db.collection("profiles").doc(username).get();
  return direct.exists ? direct : null;
}

export function derivedBadges(profile: Record<string, unknown>, stored: Array<Record<string, unknown>>) {
  const plan = getUserPlanAccess(profile);
  const badges = [...stored];
  const add = (id: string, title: string, category: string) => {
    if (!badges.some((badge) => badge.id === id || badge.title === title || badge.name === title)) badges.unshift({ id, title, category, source: "derived" });
  };
  if (profile.verified || profile.verificationStatus === "verified") add("verified-user", "Verified User", "verification");
  if (plan.isCreator) add("creator-plan", "Creator Badge", "plan");
  if (plan.isPro && !plan.isCreator) add("creator-plan", "Creator Badge", "plan");
  if (plan.isHost) add("host-plan", "Host tools", "host");
  if (plan.isSponsor && profile.sponsorVerificationStatus === "approved") add("verified-sponsor", "Verified Sponsor", "sponsor");
  return badges;
}

export async function buildSocialProfile(db: Firestore, username: string, viewerId?: string | null) {
  const profileSnap = await findProfileByUsername(db, username);
  if (!profileSnap) return null;
  const userId = profileSnap.id;
  const [accountSnap, challengesSnap, participantsSnap, submissionsSnap, winnersSnap, badgesSnap, followersSnap, followingSnap, viewerFollowSnap] = await Promise.all([
    db.collection("users").doc(userId).get(),
    db.collection("challenges").where("creatorId", "==", userId).limit(100).get(),
    db.collection("challengeParticipants").where("userId", "==", userId).limit(200).get(),
    db.collection("submissions").where("userId", "==", userId).limit(200).get(),
    db.collection("winners").where("userId", "==", userId).limit(100).get(),
    db.collection("badges").where("userId", "==", userId).limit(100).get(),
    db.collection("follows").where("followingId", "==", userId).limit(500).get(),
    db.collection("follows").where("followerId", "==", userId).limit(500).get(),
    viewerId ? db.collection("follows").doc(`${viewerId}_${userId}`).get() : Promise.resolve(null)
  ]);
  const merged = { ...(accountSnap.data() ?? {}), ...(profileSnap.data() ?? {}) };
  if (!isExplicitDemoEnvironment() && isQaDemoOrPlaceholderProfile(profileSnap.id, merged)) return null;
  const privacy = profilePrivacySettings(merged);
  const connectionsVisible = canViewProfileConnections(merged, viewerId === userId);
  const profile = toPublicProfile(userId, merged);
  const created = challengesSnap.docs.filter((doc) => isPublicChallenge(doc.id, doc.data())).map((doc) => ({ id: doc.id, ...publicChallengeFields(doc.data()) } as Record<string, unknown>));
  const participantRecords = participantsSnap.docs.filter((doc) => !isQaOrDemoRecord(doc.id, doc.data())).map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown>));
  const winnerRecords = winnersSnap.docs.filter((doc) => !isQaOrDemoRecord(doc.id, doc.data())).map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown>));
  const submissionRecords = submissionsSnap.docs.filter((doc) => isPublicSubmission(doc.id, doc.data())).map((doc) => ({ id: doc.id, ...publicSubmissionFields(doc.data()) } as Record<string, unknown>));
  const relatedChallengeIds = [...new Set([...participantRecords, ...winnerRecords, ...submissionRecords].map((item) => String(item.challengeId ?? "")).filter(Boolean))];
  const relatedChallengeSnaps = relatedChallengeIds.length ? await db.getAll(...relatedChallengeIds.map((id) => db.collection("challenges").doc(id))) : [];
  const publicRelatedChallenges = new Map(relatedChallengeSnaps.filter((snap) => snap.exists && isPublicChallenge(snap.id, snap.data() ?? {})).map((snap) => [snap.id, publicChallengeFields(snap.data() ?? {})]));
  const participating = privacy.showParticipatedChallenges === false ? [] : participantRecords.flatMap((item) => {
    const challengeId = String(item.challengeId ?? "");
    const challenge = publicRelatedChallenges.get(challengeId);
    return challenge ? [{ id: challengeId, ...challenge }] : [];
  });
  const entries = submissionRecords.filter((item) => publicRelatedChallenges.has(String(item.challengeId ?? "")));
  const wins = privacy.showWins === false ? [] : winnerRecords.filter((item) => publicRelatedChallenges.has(String(item.challengeId ?? "")));
  const storedBadges = badgesSnap.docs.filter((doc) => !isQaOrDemoRecord(doc.id, doc.data()) && !isDemoProfileContent(doc.data().title ?? doc.data().name) && !isDemoProfileContent(doc.data().description)).map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, unknown>));
  const badges = derivedBadges(merged, storedBadges);
  const completedChallenges = created.filter((item) => ["completed", "winners_announced", "settled"].includes(String(item.status ?? item.lifecycleStatus ?? ""))).length;
  const creatorLevel = calculateCreatorLevel({ completedChallenges, participantCount: participantsSnap.size, revenueCents: Number(merged.creatorRevenueCents ?? 0), completionRate: created.length ? completedChallenges / created.length : 0, disputeRate: Number(merged.creatorDisputeRate ?? 0), verified: Boolean(merged.verified || merged.verificationStatus === "verified" || merged.kycStatus === "verified") });
  const activity = privacy.showActivity === false ? [] : [
    ...created.slice(0, 10).map((item) => ({ id: `created_${item.id}`, type: "challenge_created", title: item.title, createdAt: item.createdAt })),
    ...entries.slice(0, 10).map((item) => ({ id: `entry_${item.id}`, type: "entry_submitted", title: item.title ?? item.challengeTitle, createdAt: item.createdAt ?? item.submittedAt })),
    ...wins.slice(0, 10).map((item) => ({ id: `win_${item.id}`, type: "challenge_won", title: item.challengeTitle ?? "Challenge placement", createdAt: item.announcedAt ?? item.createdAt })),
    ...badges.slice(0, 10).map((item) => ({ id: `badge_${item.id}`, type: "badge_received", title: item.title ?? item.name, createdAt: item.earnedAt ?? item.createdAt }))
  ].sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));

  return {
    profile: {
      ...profile,
      website: typeof merged.website === "string" ? merged.website : null,
      coverImageUrl: typeof merged.coverImageUrl === "string" ? merged.coverImageUrl : null,
      verified: Boolean(merged.verified || merged.verificationStatus === "verified"),
      planId: getUserPlanAccess(merged).normalizedPlanId,
      effectiveTier: getEffectiveTier(merged),
      joinedAt: merged.createdAt ?? null,
      categories: Array.isArray(merged.categoryInterests) ? merged.categoryInterests : [],
      profileVisibility: merged.profileVisibility ?? "public",
      allowMessages: privacy.allowMessages !== false,
      showFollowerConnections: connectionsVisible,
      isOwner: viewerId === userId,
      isFollowing: Boolean(viewerFollowSnap?.exists),
      creatorLevel
    },
    stats: {
      followerCount: connectionsVisible ? followersSnap.size : null,
      followingCount: connectionsVisible ? followingSnap.size : null,
      createdChallengeCount: created.length,
      participatedChallengeCount: participating.length,
      entryCount: entries.length,
      winCount: wins.length,
      badgeCount: badges.length
    },
    created,
    participating,
    entries,
    wins,
    badges,
    activity
  };
}

