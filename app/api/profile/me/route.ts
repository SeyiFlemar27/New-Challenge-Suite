import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { ensureWallet } from "@/lib/server/dorocoin";
import { ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { getEffectiveTier, getUserPlanAccess, planFieldsFor } from "@/lib/plan-access";
import { sanitizeCustomization } from "@/lib/customization/access";
import { resolveProfileIdentity, isDemoProfileContent } from "@/lib/profile-identity";
import { isQaOrDemoRecord } from "@/lib/server/public-challenge";
import { grantRewardPointsForEvent } from "@/lib/server/reward-economy";
import { z } from "zod";

export const dynamic = "force-dynamic";

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return null;
}

function initialsFromName(name: string) {
  return name
    .split(" ")
    .map((part) => part.trim()[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function runProfileRead<T>(label: string, userId: string, read: () => Promise<T>) {
  try {
    return await read();
  } catch (error) {
    console.error("[api/profile/me] Firestore read failed", {
      label,
      userId,
      error: safeErrorMessage(error)
    });
    throw new Error(`Profile read failed: ${label}`);
  }
}

async function runOptionalProfileRead<T>(label: string, userId: string, fallback: T, read: () => Promise<T>) {
  try {
    return await read();
  } catch (error) {
    console.error("[api/profile/me] Optional Firestore read failed", {
      label,
      userId,
      error: safeErrorMessage(error)
    });
    return fallback;
  }
}

const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(2, "Display name must be at least 2 characters.").max(80, "Display name must be 80 characters or fewer."),
  selfDeclaredRegion: z.enum(["US", "NG"], { message: "Select United States or Nigeria." })
});

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;

  const db = getAdminDb();
  if (!db) return serverUnavailable("Profile");

  try {
    const walletRef = await runProfileRead("ensure doroCoinWallets document", user.uid, () => ensureWallet(db, user.uid));
    const [accountSnap, profileSnap, walletSnap] = await Promise.all([
      runProfileRead("users document", user.uid, () => db.collection("users").doc(user.uid).get()),
      runProfileRead("profiles document", user.uid, () => db.collection("profiles").doc(user.uid).get()),
      runProfileRead("doroCoinWallets document", user.uid, () => walletRef.get())
    ]);

    let account = accountSnap.exists ? accountSnap.data() ?? {} : {};
    let profile = profileSnap.exists ? profileSnap.data() ?? {} : {};
    const wallet = walletSnap.exists ? walletSnap.data() ?? {} : {};
    const now = new Date().toISOString();
    const fallbackIdentity = resolveProfileIdentity({ ...account, ...profile }, String(user.email ?? ""));
    const fallbackDisplayName = fallbackIdentity.displayName;
    const fallbackInitials = fallbackIdentity.initials;

    if (!accountSnap.exists || !profileSnap.exists) {
      const baseProfile = {
        uid: user.uid,
        email: user.email ?? "",
        displayName: fallbackDisplayName,
        initials: fallbackInitials,
        role: String(account.role ?? profile.role ?? "user"),
        ...planFieldsFor("free"),
        premium: false,
        verified: Boolean(profile.verified || profile.emailVerified || account.emailVerified || user.emailVerified),
        emailVerified: Boolean(profile.emailVerified || profile.verified || account.emailVerified || user.emailVerified),
        customization: sanitizeCustomization(null),
        customizationUnlockedByPlan: "free",
        createdAt: String(profile.createdAt ?? account.createdAt ?? now),
        updatedAt: now
      };

      await Promise.all([
        !accountSnap.exists
          ? runProfileRead("bootstrap users document", user.uid, () => db.collection("users").doc(user.uid).set(baseProfile, { merge: true }))
          : Promise.resolve(),
        !profileSnap.exists
          ? runProfileRead("bootstrap profiles document", user.uid, () => db.collection("profiles").doc(user.uid).set(baseProfile, { merge: true }))
          : Promise.resolve()
      ]);

      account = { ...baseProfile, ...account };
      profile = { ...baseProfile, ...profile };
    }

    const [submissionsSnap, badgesSnap, creatorChallengesSnap, hostChallengesSnap, winsSnap] = await Promise.all([
      runOptionalProfileRead("submissions where userId == uid orderBy createdAt desc", user.uid, null, () => db.collection("submissions").where("userId", "==", user.uid).orderBy("createdAt", "desc").limit(50).get()),
      runOptionalProfileRead("badges where userId == uid", user.uid, null, () => db.collection("badges").where("userId", "==", user.uid).limit(50).get()),
      runOptionalProfileRead("challenges where creatorId == uid", user.uid, null, () => db.collection("challenges").where("creatorId", "==", user.uid).limit(50).get()),
      runOptionalProfileRead("challenges where hostId == uid", user.uid, null, () => db.collection("challenges").where("hostId", "==", user.uid).limit(50).get()),
      runOptionalProfileRead("winners where userId == uid", user.uid, null, () => db.collection("winners").where("userId", "==", user.uid).limit(50).get())
    ]);

    const identity = resolveProfileIdentity({ ...account, ...profile }, String(user.email ?? ""));
    const displayName = identity.displayName;
    const planProfile = { ...profile, ...account };
    const planAccess = getUserPlanAccess(planProfile);
    const effectiveTier = getEffectiveTier(planProfile);
    const customization = sanitizeCustomization((profile.customization ?? account.customization) as any);
    const submissions: Array<Record<string, unknown>> = submissionsSnap ? submissionsSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        createdAt: toIso(data.createdAt),
        submittedAt: toIso(data.submittedAt)
      };
    }) : [];
    const badges: Array<Record<string, unknown> & { id: string; earnedAt: string | null }> = badgesSnap ? badgesSnap.docs.filter((doc) => !isQaOrDemoRecord(doc.id, doc.data()) && !isDemoProfileContent(doc.data().title ?? doc.data().name) && !isDemoProfileContent(doc.data().description)).map((doc) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        earnedAt: toIso(data.earnedAt ?? data.createdAt)
      };
    }) : [];
    const challenges: Array<Record<string, unknown> & { id: string }> = [...new Map([...(creatorChallengesSnap?.docs ?? []), ...(hostChallengesSnap?.docs ?? [])].map((doc) => [doc.id, { id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string }])).values()]
      .filter((item) => !isQaOrDemoRecord(item.id, item))
      .map((item) => ({ ...item, createdAt: toIso(item.createdAt), updatedAt: toIso(item.updatedAt) }));
    const wins: Array<Record<string, unknown> & { id: string; createdAt: string | null; approvedAt: string | null }> = (winsSnap?.docs ?? []).filter((doc) => !isQaOrDemoRecord(doc.id, doc.data())).map((doc) => {
      const data = doc.data();
      return { ...data, id: doc.id, createdAt: toIso(data.createdAt), approvedAt: toIso(data.approvedAt) };
    });
    const activity = [
      ...submissions.map((item) => ({ id: `submission_${item.id}`, type: "submission", title: item.title ?? "Challenge entry submitted", createdAt: item.submittedAt ?? item.createdAt ?? null })),
      ...badges.map((item) => ({ id: `badge_${item.id}`, type: "achievement", title: item.title ?? item.name ?? "Achievement earned", createdAt: item.earnedAt ?? null })),
      ...wins.map((item) => ({ id: `win_${item.id}`, type: "win", title: item.challengeTitle ?? "Confirmed challenge win", createdAt: item.approvedAt ?? item.createdAt ?? null }))
    ].filter((item) => item.createdAt).sort((a, b) => Date.parse(String(b.createdAt)) - Date.parse(String(a.createdAt))).slice(0, 20);
    const totalLikes = submissions.reduce((sum, submission) => sum + Number(submission.likes ?? submission.voteCount ?? submission.weightedVoteCount ?? 0), 0);

    return ok({
      profileExists: true,
      user: {
        uid: user.uid,
        email: user.email ?? profile.email ?? account.email ?? "",
        displayName,
        username: profile.username ?? profile.handle ?? account.username ?? null,
        initials: identity.initials,
        avatarUrl: profile.avatarUrl ?? profile.photoURL ?? account.avatarUrl ?? null,
        role: account.role ?? profile.role ?? null,
        selectedAccountType: account.account_type ?? profile.account_type ?? account.role ?? profile.role ?? "user",
        effectiveTier,
        ...planAccess,
        selfDeclaredRegion: profile.selfDeclaredRegion ?? account.selfDeclaredRegion ?? null,
        verified: Boolean(profile.verified ?? user.emailVerified),
        premium: planAccess.isPremium,
        joinedAt: toIso(profile.createdAt ?? account.createdAt),
        doroBalance: Number(wallet.balance ?? 0),
        customization,
        customizationUpdatedAt: profile.customizationUpdatedAt ?? account.customizationUpdatedAt ?? null,
        customizationUnlockedByPlan: profile.customizationUnlockedByPlan ?? account.customizationUnlockedByPlan ?? planAccess.planId
      },
      stats: {
        totalPoints: Number(profile.totalPoints ?? account.totalPoints ?? 0),
        submissions: submissions.length,
        totalLikes: Number(profile.totalLikes ?? totalLikes),
        wins: wins.length,
        followers: Number(profile.followers ?? 0),
        following: Number(profile.following ?? 0)
      },
      badges,
      submissions,
      challenges,
      wins,
      activity
    }, "Profile loaded.");
  } catch (error) {
    return serverError("Profile could not be loaded.", error instanceof Error ? error.message : error);
  }
}

export async function PATCH(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;

  const db = getAdminDb();
  if (!db) return serverUnavailable("Profile updates");

  const parsedBody = await readJson(request);
  if (parsedBody.response) return parsedBody.response;

  const parsed = profileUpdateSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "profile");
      fieldErrors[field] = issue.message;
    }
    return validationError(fieldErrors);
  }

  try {
    const now = new Date().toISOString();
    const initials = initialsFromName(parsed.data.displayName);
    await Promise.all([
      db.collection("profiles").doc(user.uid).set({
        uid: user.uid,
        email: user.email ?? "",
        displayName: parsed.data.displayName,
        initials,
        selfDeclaredRegion: parsed.data.selfDeclaredRegion,
        verified: user.emailVerified,
        updatedAt: now
      }, { merge: true }),
      db.collection("users").doc(user.uid).set({
        uid: user.uid,
        email: user.email ?? "",
        displayName: parsed.data.displayName,
        selfDeclaredRegion: parsed.data.selfDeclaredRegion,
        emailVerified: user.emailVerified,
        updatedAt: now
      }, { merge: true })
    ]);
    await grantRewardPointsForEvent(db, { userId: user.uid, eventType: "profile_completed", sourceId: user.uid, sourceEventKey: `profile-complete:${user.uid}`, metadata: { completedFields: ["displayName", "selfDeclaredRegion"] } }).catch(() => undefined);

    return ok({
      user: {
        uid: user.uid,
        email: user.email ?? "",
        displayName: parsed.data.displayName,
        initials,
        selfDeclaredRegion: parsed.data.selfDeclaredRegion
      }
    }, "Profile changes saved.");
  } catch (error) {
    return serverError("Profile could not be updated.", error instanceof Error ? error.message : error);
  }
}
