import { getAdminDb } from "@/lib/firebase/admin";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { ensureWallet } from "@/lib/server/dorocoin";
import { ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { getUserPlanAccess, normalizeAccountType, planFieldsFor } from "@/lib/plan-access";
import { sanitizeCustomization } from "@/lib/customization/access";
import { z } from "zod";

export const dynamic = "force-dynamic";

const roleSchema = z.enum(["user", "creator", "sponsor"]);

const bootstrapSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(60, "First name must be 60 characters or fewer."),
  lastName: z.string().trim().min(1, "Last name is required.").max(60, "Last name must be 60 characters or fewer."),
  role: roleSchema
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

function initialPlanForRole(role: z.infer<typeof roleSchema>) {
  if (role === "sponsor") return "sponsor_starter";
  if (role === "creator") return "creator";
  return "free";
}

function toProfile(user: { uid: string; email?: string; emailVerified?: boolean }, account: Record<string, unknown>, profile: Record<string, unknown>, wallet: Record<string, unknown>) {
  const displayName = String(profile.displayName ?? account.displayName ?? user.email ?? "");
  const merged = { ...profile, ...account };
  const isAdmin = Boolean(account.isAdmin || profile.isAdmin);
  const planAccess = getUserPlanAccess(merged);
  const accountType = isAdmin ? "admin" : normalizeAccountType(merged);
  const sponsorOnboardingStatus = typeof merged.sponsorOnboardingStatus === "string" ? merged.sponsorOnboardingStatus : accountType === "sponsor" ? "not_started" : null;
  const hasSponsorProfile = Boolean(merged.hasSponsorProfile || merged.brandProfileComplete || merged.sponsorOnboardingComplete);

  return {
    uid: user.uid,
    firstName: String(profile.firstName ?? account.firstName ?? ""),
    lastName: String(profile.lastName ?? account.lastName ?? ""),
    displayName,
    email: String(user.email ?? profile.email ?? account.email ?? ""),
    role: typeof account.role === "string" ? account.role : typeof profile.role === "string" ? profile.role : "user",
    ...planAccess,
    accountType,
    dashboardType: accountType === "sponsor" ? "sponsor_dashboard" : "user_dashboard",
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

    const initialPlanId = initialPlanForRole(parsed.data.role);
    const planFields = planFieldsFor(initialPlanId);
    const accountType = isAdmin ? "admin" : planFields.accountType;
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
        ...planFields,
        accountType,
        dashboardType,
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
        ...planFields,
        accountType,
        dashboardType,
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



