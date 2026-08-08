import { getAdminDb } from "@/lib/firebase/admin";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { ensureWallet } from "@/lib/server/dorocoin";
import { fail, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { getUserPlanAccess, normalizeAccountType, planFieldsFor } from "@/lib/plan-access";
import { sanitizeCustomization } from "@/lib/customization/access";
import { z } from "zod";
import { awardDoroCoinEngagement } from "@/lib/server/economy-dorocoin";
import { deterministicId } from "@/lib/server/idempotency";

export const dynamic = "force-dynamic";

const roleSchema = z.enum(["user", "creator", "host", "sponsor"]);

const bootstrapSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(60, "First name must be 60 characters or fewer."),
  lastName: z.string().trim().min(1, "Last name is required.").max(60, "Last name must be 60 characters or fewer."),
  role: roleSchema,
  referralCode: z.string().trim().min(4).max(64).optional()
});

const accountTypeSelectionSchema = z.object({
  accountType: z.enum(["user", "creator", "host", "sponsor"])
});

function initialsFromName(name: string) {
  return name
    .split(" ")
    .map((part) => part.trim()[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function toProfile(user: { uid: string; email?: string; emailVerified?: boolean }, account: Record<string, unknown>, profile: Record<string, unknown>, wallet: Record<string, unknown>) {
  const displayName = String(profile.displayName ?? account.displayName ?? user.email ?? "");
  const merged = { ...profile, ...account };
  const isAdmin = Boolean(account.isAdmin || profile.isAdmin);
  const planAccess = getUserPlanAccess(merged);
  const accountType = isAdmin ? "admin" : normalizeAccountType(merged);
  const sponsorOnboardingStatus = typeof merged.sponsorOnboardingStatus === "string" ? merged.sponsorOnboardingStatus : accountType === "sponsor" ? "not_started" : null;
  const hasSponsorProfile = Boolean(merged.hasSponsorProfile || merged.brandProfileComplete || merged.sponsorOnboardingComplete);
  const accountTypeSelectionComplete = merged.accountTypeSelectionComplete === false
    ? false
    : Boolean(merged.account_type || merged.accountType || merged.role);

  return {
    uid: user.uid,
    firstName: String(profile.firstName ?? account.firstName ?? ""),
    lastName: String(profile.lastName ?? account.lastName ?? ""),
    displayName,
    email: String(user.email ?? profile.email ?? account.email ?? ""),
    role: typeof account.role === "string" ? account.role : typeof profile.role === "string" ? profile.role : "user",
    ...planAccess,
    accountType,
    dashboardType: String(merged.dashboard_type ?? merged.dashboardType ?? (accountType === "sponsor" ? "sponsor_dashboard" : "user_dashboard")),
    selectedAccountType: String(merged.account_type ?? (accountType === "sponsor" ? "sponsor" : "user")),
    accountTypeSelectionComplete,
    roleIntent: String(merged.role_intent ?? merged.roleIntent ?? "compete"),
    planId: planAccess.normalizedPlanId,
    legacyPlanId: planAccess.planId,
    doroBalance: typeof wallet.balance === "number" ? wallet.balance : 0,
    customization: sanitizeCustomization((profile.customization ?? account.customization) as any),
    initials: String(profile.initials ?? initialsFromName(displayName || String(user.email ?? ""))),
    premium: planAccess.isPremium,
    verified: Boolean(profile.verified || profile.emailVerified || account.emailVerified || account.verificationStatus === "verified" || user.emailVerified),
    emailVerified: Boolean(profile.emailVerified || profile.verified || account.emailVerified || account.verificationStatus === "verified" || user.emailVerified),
    emailVerifiedAt: profile.emailVerifiedAt ?? account.emailVerifiedAt ?? null,
    isAdmin,
    sponsorOnboardingStatus,
    sponsorOnboardingComplete: Boolean(merged.sponsorOnboardingComplete || merged.brandProfileComplete),
    creatorOnboardingComplete: Boolean(merged.creatorOnboardingComplete),
    hostOnboardingComplete: Boolean(merged.hostOnboardingComplete),
    walkthroughCompleted: merged.walkthroughCompleted === undefined ? true : Boolean(merged.walkthroughCompleted),
    hasSponsorProfile,
    sponsorVerificationStatus: typeof merged.sponsorVerificationStatus === "string" ? merged.sponsorVerificationStatus : accountType === "sponsor" ? "not_submitted" : null
  };
}

export async function GET(request: Request) {
  const { user, response } = await requireAuthenticatedUser(request);
  if (response) return response;

  const db = getAdminDb();
  if (!db) return serverUnavailable("Profile bootstrap");

  try {
    const walletRef = await ensureWallet(db, user.uid);
    const [accountSnap, profileSnap, walletSnap] = await Promise.all([
      db.collection("users").doc(user.uid).get(),
      db.collection("profiles").doc(user.uid).get(),
      walletRef.get()
    ]);

    return ok({
      profileExists: profileSnap.exists,
      user: toProfile(
        user,
        accountSnap.exists ? accountSnap.data() ?? {} : {},
        profileSnap.exists ? profileSnap.data() ?? {} : {},
        walletSnap.exists ? walletSnap.data() ?? {} : {}
      )
    }, "Profile loaded.");
  } catch (error) {
    return serverError("Profile could not be loaded.", error instanceof Error ? error.message : error);
  }
}

export async function POST(request: Request) {
  const { user, response } = await requireAuthenticatedUser(request);
  if (response) return response;

  const db = getAdminDb();
  if (!db) return serverUnavailable("Profile bootstrap");

  const parsedBody = await readJson(request);
  if (parsedBody.response) return parsedBody.response;

  const parsed = bootstrapSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0] ?? "profile")] = issue.message;
    }
    return validationError(fieldErrors);
  }

  try {
    const now = new Date().toISOString();
    const email = user.email ?? "";
    const displayName = `${parsed.data.firstName} ${parsed.data.lastName}`.trim();
    const adminEmails = (process.env.NEXT_PUBLIC_INITIAL_ADMIN_EMAILS || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    const isAdmin = Boolean(email && adminEmails.includes(email.toLowerCase()));

    // Signup role expresses account intent only. Paid entitlement is granted
    // later by verified Stripe webhook processing.
    const planFields = planFieldsFor("free");
    const accountType = isAdmin ? "admin" : parsed.data.role === "sponsor" ? "sponsor" : "user";
    const dashboardType = accountType === "sponsor" ? "sponsor_dashboard" : "user_dashboard";
    const sponsorFields = accountType === "sponsor"
      ? {
          sponsorOnboardingStatus: "not_started",
          sponsorVerificationStatus: "not_submitted",
          hasSponsorProfile: false,
          brandProfileComplete: false,
          sponsorOnboardingComplete: false
        }
      : {};

    await Promise.all([
      db.collection("users").doc(user.uid).set({
        uid: user.uid,
        email,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        displayName,
        role: parsed.data.role,
        roleIntent: parsed.data.role,
        role_intent: parsed.data.role === "sponsor" ? "sponsor" : parsed.data.role === "creator" ? "create" : parsed.data.role === "host" ? "host" : "compete",
        ...planFields,
        accountType,
        account_type: null,
        dashboardType,
        dashboard_type: dashboardType,
        accountTypeSelectionComplete: false,
        walkthroughCompleted: false,
        ...sponsorFields,
        isAdmin,
        emailVerified: Boolean(user.emailVerified),
        verificationStatus: user.emailVerified ? "verified" : "pending",
        createdAt: now,
        updatedAt: now
      }, { merge: true }),
      db.collection("profiles").doc(user.uid).set({
        uid: user.uid,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        displayName,
        initials: initialsFromName(displayName || email),
        email,
        role: parsed.data.role,
        roleIntent: parsed.data.role,
        role_intent: parsed.data.role === "sponsor" ? "sponsor" : parsed.data.role === "creator" ? "create" : parsed.data.role === "host" ? "host" : "compete",
        ...planFields,
        accountType,
        account_type: null,
        dashboardType,
        dashboard_type: dashboardType,
        accountTypeSelectionComplete: false,
        walkthroughCompleted: false,
        ...sponsorFields,
        premium: planFields.isPremium,
        verified: Boolean(user.emailVerified),
        emailVerified: Boolean(user.emailVerified),
        verificationStatus: user.emailVerified ? "verified" : "pending",
        isAdmin,
        customization: sanitizeCustomization(null),
        customizationUnlockedByPlan: planFields.legacyPlanId,
        createdAt: now,
        updatedAt: now
      }, { merge: true }),
      ensureWallet(db, user.uid)
    ]);

    if (parsed.data.referralCode) {
      const code = parsed.data.referralCode.toUpperCase();
      const referralCodes = await db.collection("referralCodes").where("codeNormalized", "==", code).limit(1).get();
      const referrerId = String(referralCodes.docs[0]?.data().userId ?? "");
      if (referrerId && referrerId !== user.uid) {
        const referralRef = db.collection("userReferrals").doc(deterministicId("referral", user.uid));
        const existing = await referralRef.get();
        if (!existing.exists) {
          await referralRef.create({ id: referralRef.id, referrerId, referredUserId: user.uid, referralCodeId: referralCodes.docs[0].id, status: user.emailVerified ? "qualified" : "pending_email_verification", suspiciousSignals: [], createdAt: now, updatedAt: now });
          if (user.emailVerified) await awardDoroCoinEngagement(db, { userId: referrerId, sourceType: "referral_signup", actionId: user.uid });
        }
      } else if (referrerId === user.uid) {
        await db.collection("adminActionTasks").doc(deterministicId("referral_self", user.uid)).set({ type: "dorocoin_referral_review", userId: user.uid, status: "open", signals: ["self_referral_attempt"], createdAt: now }, { merge: true });
      }
    }

    const walletRef = await ensureWallet(db, user.uid);
    const [accountSnap, profileSnap, walletSnap] = await Promise.all([
      db.collection("users").doc(user.uid).get(),
      db.collection("profiles").doc(user.uid).get(),
      walletRef.get()
    ]);

    return ok({
      profileExists: true,
      user: toProfile(user, accountSnap.data() ?? {}, profileSnap.data() ?? {}, walletSnap.data() ?? {})
    }, "Profile created.");
  } catch (error) {
    return serverError("Profile could not be created.", error instanceof Error ? error.message : error);
  }
}

export async function PATCH(request: Request) {
  const { user, response } = await requireAuthenticatedUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Account type selection");
  const parsedBody = await readJson(request);
  if (parsedBody.response) return parsedBody.response;
  const parsed = accountTypeSelectionSchema.safeParse(parsedBody.body);
  if (!parsed.success) return validationError({ accountType: "Choose a valid account type." });

  try {
    const [accountSnap, profileSnap] = await Promise.all([
      db.collection("users").doc(user.uid).get(),
      db.collection("profiles").doc(user.uid).get()
    ]);
    const existing = { ...(profileSnap.data() ?? {}), ...(accountSnap.data() ?? {}) };
    if (existing.isAdmin || existing.accountType === "admin") return fail("Admin account type cannot be changed here.", 403, undefined, "PERMISSION_DENIED");
    if (existing.accountTypeSelectionComplete === true) return fail("Account type has already been selected.", 409, undefined, "ACCOUNT_TYPE_ALREADY_SELECTED");

    const selected = parsed.data.accountType;
    const compatibilityAccountType = selected === "sponsor" ? "sponsor" : "user";
    const role = selected === "user" ? "user" : selected;
    const roleIntent = selected === "user" ? "compete" : selected === "creator" ? "create" : selected;
    const dashboardType = selected === "creator" ? "creator_studio" : selected === "host" ? "host_control_center" : selected === "sponsor" ? "sponsor_dashboard" : "user_dashboard";
    const now = new Date().toISOString();
    const sponsorFields = selected === "sponsor" ? {
      sponsorOnboardingStatus: "not_started",
      sponsorVerificationStatus: "not_submitted",
      hasSponsorProfile: false,
      sponsorOnboardingComplete: false
    } : {};
    const fields = {
      accountType: compatibilityAccountType,
      account_type: selected,
      dashboardType,
      dashboard_type: dashboardType,
      role,
      roleIntent,
      role_intent: roleIntent,
      accountTypeSelectionComplete: true,
      ...sponsorFields,
      updatedAt: now
    };
    await Promise.all([
      db.collection("users").doc(user.uid).set(fields, { merge: true }),
      db.collection("profiles").doc(user.uid).set(fields, { merge: true })
    ]);
    return ok({ accountType: selected, dashboardType, roleIntent, destination: selected === "sponsor" ? "/sponsor/onboarding" : "/dashboard" }, "Account type selected. Paid plan access was not changed.");
  } catch (error) {
    return serverError("Account type could not be selected.", error instanceof Error ? error.message : error);
  }
}



