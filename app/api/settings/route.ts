import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { getEffectiveTier, getUserPlanAccess } from "@/lib/plan-access";
import { fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";
import { profileMediaPath } from "@/lib/media-upload-paths";

const settingsSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  username: z.string().trim().regex(/^[a-zA-Z0-9._]{3,30}$/, "Username must be 3-30 letters, numbers, dots, or underscores."),
  phone: z.string().trim().max(40).optional().default(""),
  avatarUrl: z.string().trim().url().optional().or(z.literal("")),
  avatarPath: z.string().trim().max(500).optional().default(""),
  coverImageUrl: z.string().trim().url().optional().or(z.literal("")),
  coverImagePath: z.string().trim().max(500).optional().default(""),
  bio: z.string().trim().max(600).optional().default(""),
  location: z.string().trim().max(120).optional().default(""),
  website: z.string().trim().url().optional().or(z.literal("")),
  socialLinks: z.array(z.string().trim().url()).max(8).default([]),
  categoryInterests: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  profileVisibility: z.enum(["public", "private"]).default("public"),
  privacy: z.object({
    showFollowersFollowing: z.boolean().default(true),
    showActivity: z.boolean().default(true),
    showWins: z.boolean().default(true),
    showParticipatedChallenges: z.boolean().default(true),
    allowMessages: z.boolean().default(true),
    allowSponsorMessages: z.boolean().default(true),
    showEarnings: z.boolean().default(false)
  }),
  notifications: z.object({
    challengeReminders: z.boolean().default(true),
    liveChallengeReminders: z.boolean().default(true),
    voteNotifications: z.boolean().default(true),
    commentsReplies: z.boolean().default(true),
    followerNotifications: z.boolean().default(true),
    sponsorRequestUpdates: z.boolean().default(true),
    billingAlerts: z.boolean().default(true),
    email: z.boolean().default(true),
    push: z.boolean().default(false),
    inApp: z.boolean().default(true)
  }),
  preferences: z.object({
    favoriteCategories: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    preferredChallengeTypes: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    locationPreference: z.string().trim().max(120).default(""),
    contentLanguage: z.string().trim().max(40).default("English"),
    matureContent: z.boolean().default(false),
    appearance: z.enum(["system", "light", "dark"]).default("system")
  }),
  sponsorDefaults: z.object({
    ctaButtonText: z.string().trim().max(40).default("Visit Website"),
    ctaDestinationLink: z.string().trim().url().optional().or(z.literal("")),
    campaignPreferences: z.array(z.string().trim().min(1).max(80)).max(20).default([])
  }).optional()
});

function invalidProfileMediaPath(userId: string, path: string, folder: "avatar" | "banner") {
  if (!path) return false;
  const expected = profileMediaPath(userId, folder) + "/";
  return !path.startsWith(expected) || /^https?:/i.test(path) || path.includes("..");
}

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Settings");
  const [accountSnap, profileSnap, notificationsSnap, preferencesSnap, sponsorSnap] = await Promise.all([
    db.collection("users").doc(user.uid).get(),
    db.collection("profiles").doc(user.uid).get(),
    db.collection("notificationPreferences").doc(user.uid).get(),
    db.collection("userPreferences").doc(user.uid).get(),
    db.collection("sponsorProfiles").doc(user.uid).get()
  ]);
  const account = accountSnap.data() ?? {};
  const profile = profileSnap.data() ?? {};
  const plan = getUserPlanAccess({ ...profile, ...account });
  const effectiveTier = getEffectiveTier({ ...profile, ...account });
  return ok({
    account: {
      displayName: profile.displayName ?? account.displayName ?? "",
      username: profile.username ?? "",
      email: user.email ?? profile.email ?? account.email ?? "",
      phone: profile.phone ?? "",
      accountType: plan.accountType,
      planId: plan.normalizedPlanId,
      subscriptionStatus: account.subscriptionStatus ?? profile.subscriptionStatus ?? "free",
      effectiveTier
    },
    profile: {
      avatarUrl: profile.avatarUrl ?? "",
      avatarPath: profile.avatarPath ?? "",
      coverImageUrl: profile.coverImageUrl ?? "",
      coverImagePath: profile.coverImagePath ?? "",
      bio: profile.bio ?? "",
      location: profile.location ?? "",
      website: profile.website ?? "",
      socialLinks: profile.socialLinks ?? [],
      categoryInterests: profile.categoryInterests ?? []
    },
    profileVisibility: profile.profileVisibility ?? "public",
    privacy: profile.privacySettings ?? {
      showFollowersFollowing: true, showActivity: true, showWins: true, showParticipatedChallenges: true,
      allowMessages: true, allowSponsorMessages: true, showEarnings: false
    },
    notifications: notificationsSnap.data() ?? {
      challengeReminders: true, liveChallengeReminders: true, voteNotifications: true, commentsReplies: true,
      followerNotifications: true, sponsorRequestUpdates: true, billingAlerts: true, email: true, push: false, inApp: true
    },
    preferences: preferencesSnap.data() ?? {
      favoriteCategories: [], preferredChallengeTypes: [], locationPreference: "", contentLanguage: "English", matureContent: false, appearance: "system"
    },
    sponsorDefaults: sponsorSnap.exists ? {
      ctaButtonText: sponsorSnap.data()?.ctaButtonText ?? "Visit Website",
      ctaDestinationLink: sponsorSnap.data()?.ctaDestinationLink ?? "",
      campaignPreferences: sponsorSnap.data()?.campaignPreferences ?? [],
      verificationStatus: sponsorSnap.data()?.sponsorVerificationStatus ?? "not_submitted"
    } : null
  }, "Settings loaded.");
}

export async function PATCH(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Settings");
  const parsedBody = await readJson(request);
  if (parsedBody.response) return parsedBody.response;
  const parsed = settingsSchema.safeParse(parsedBody.body);
  if (!parsed.success) return validationError(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0] ?? "settings"), issue.message])));
  const input = parsed.data;
  if (invalidProfileMediaPath(user.uid, input.avatarPath, "avatar")) return validationError({ avatarPath: "Profile avatar must be uploaded to your authenticated profile media path." });
  if (invalidProfileMediaPath(user.uid, input.coverImagePath, "banner")) return validationError({ coverImagePath: "Profile banner must be uploaded to your authenticated profile media path." });
  const usernameNormalized = input.username.toLowerCase();
  const usernameMatch = await db.collection("profiles").where("usernameNormalized", "==", usernameNormalized).limit(1).get();
  if (usernameMatch.docs[0] && usernameMatch.docs[0].id !== user.uid) return fail("Username is already in use.", 409, undefined, "USERNAME_TAKEN");
  const now = new Date().toISOString();
  const profileUpdate = {
    displayName: input.displayName,
    username: input.username,
    usernameNormalized,
    phone: input.phone || null,
    avatarUrl: input.avatarUrl || null,
    avatarPath: input.avatarUrl ? input.avatarPath || null : null,
    coverImageUrl: input.coverImageUrl || null,
    coverImagePath: input.coverImageUrl ? input.coverImagePath || null : null,
    bio: input.bio,
    location: input.location,
    website: input.website || null,
    socialLinks: input.socialLinks,
    categoryInterests: input.categoryInterests,
    profileVisibility: input.profileVisibility,
    privacySettings: input.privacy,
    updatedAt: now
  };
  const writes: Promise<unknown>[] = [
    db.collection("profiles").doc(user.uid).set(profileUpdate, { merge: true }),
    db.collection("users").doc(user.uid).set({ displayName: input.displayName, username: input.username, usernameNormalized, updatedAt: now }, { merge: true }),
    db.collection("notificationPreferences").doc(user.uid).set({ userId: user.uid, ...input.notifications, updatedAt: now }, { merge: true }),
    db.collection("userPreferences").doc(user.uid).set({ userId: user.uid, ...input.preferences, updatedAt: now }, { merge: true })
  ];
  if (input.sponsorDefaults) {
    writes.push(db.collection("sponsorProfiles").doc(user.uid).set({
      ctaButtonText: input.sponsorDefaults.ctaButtonText.replace(/[<>]/g, ""),
      ctaDestinationLink: input.sponsorDefaults.ctaDestinationLink || null,
      campaignPreferences: input.sponsorDefaults.campaignPreferences,
      updatedAt: now
    }, { merge: true }));
  }
  await Promise.all(writes);
  return ok({ saved: true, username: input.username }, "Settings saved.");
}
