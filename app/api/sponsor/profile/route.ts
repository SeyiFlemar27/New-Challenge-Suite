import { getAdminDb } from "@/lib/firebase/admin";
import { normalizeAccountType } from "@/lib/plan-access";
import { requireRequestUser } from "@/lib/server/auth";
import { forbidden, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { normalizeSponsorReviewStatus } from "@/lib/sponsor-access";
import { z } from "zod";

export const dynamic = "force-dynamic";

const sponsorProfileSchema = z.object({
  brandName: z.string().trim().min(2, "Brand name is required.").max(120),
  industry: z.string().trim().min(2, "Industry/category is required.").max(100),
  website: z.string().trim().url("Enter a valid website URL.").optional().or(z.literal("")),
  countryLocation: z.string().trim().min(2, "Country/location is required.").max(120),
  brandDescription: z.string().trim().min(20, "Brand description should be at least 20 characters.").max(1200),
  socialLinks: z.array(z.string().trim().url("Each social link must be a valid URL.")).max(8).default([]),
  contactPerson: z.string().trim().min(2, "Contact person is required.").max(120),
  businessEmail: z.string().trim().email("Enter a valid business email."),
  logoUrl: z.string().trim().url("Logo URL must be valid.").optional().or(z.literal("")),
  bannerUrl: z.string().trim().url("Banner URL must be valid.").optional().or(z.literal("")),
  ctaButtonText: z.string().trim().min(2, "CTA button text is required.").max(40).transform((value) => value.replace(/[<>]/g, "")),
  ctaDestinationLink: z.string().trim().url("Enter a valid CTA destination link."),
  sponsorshipGoals: z.array(z.string().trim().min(1)).min(1, "Select at least one sponsorship goal.").max(8),
  preferredChallengeCategories: z.array(z.string().trim().min(1)).min(1, "Select at least one preferred category.").max(12),
  reviewAction: z.enum(["save", "submit"]).default("save")
});

type SponsorProfileInput = z.infer<typeof sponsorProfileSchema>;

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "brand";
}

function cleanOptionalUrl(value: string | undefined) {
  return value && value.trim() ? value.trim() : null;
}

function fieldErrorsFromZod(error: z.ZodError) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "profile");
    fieldErrors[field] = issue.message;
  }
  return fieldErrors;
}

function defaultSponsorProfile(userId: string, email?: string) {
  return {
    userId,
    accountType: "sponsor",
    dashboardType: "sponsor_dashboard",
    sponsorOnboardingStatus: "not_started",
    hasSponsorProfile: false,
    sponsorOnboardingComplete: false,
    sponsorVerificationStatus: "not_submitted",
    brandName: "",
    brandSlug: "",
    industry: "",
    website: null,
    countryLocation: "",
    brandDescription: "",
    socialLinks: [],
    contactPerson: "",
    businessEmail: email ?? "",
    logoUrl: null,
    bannerUrl: null,
    ctaButtonText: "Learn More",
    ctaDestinationLink: "",
    sponsorshipGoals: [],
    preferredChallengeCategories: [],
    brandProfileCompletedAt: null,
    updatedAt: null
  };
}

async function loadSponsorContext(db: FirebaseFirestore.Firestore, uid: string) {
  const [userSnap, profileSnap, sponsorSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("profiles").doc(uid).get(),
    db.collection("sponsorProfiles").doc(uid).get()
  ]);
  const userData = userSnap.exists ? userSnap.data() ?? {} : {};
  const profileData = profileSnap.exists ? profileSnap.data() ?? {} : {};
  const sponsorData = sponsorSnap.exists ? sponsorSnap.data() ?? {} : {};
  return { userData, profileData, sponsorData, sponsorExists: sponsorSnap.exists };
}

function assertSponsorAccount(userData: Record<string, unknown>, profileData: Record<string, unknown>) {
  const accountType = normalizeAccountType({ ...profileData, ...userData });
  if (accountType !== "sponsor") {
    return forbidden("A sponsor account is required for the Brand Command Center.");
  }
  return null;
}

function toSponsorProfile(uid: string, email: string | undefined, userData: Record<string, unknown>, profileData: Record<string, unknown>, sponsorData: Record<string, unknown>) {
  const fallback = defaultSponsorProfile(uid, email);
  const merged = { ...fallback, ...profileData, ...userData, ...sponsorData };
  return {
    ...merged,
    userId: uid,
    accountType: "sponsor",
    dashboardType: "sponsor_dashboard",
    hasSponsorProfile: Boolean(merged.hasSponsorProfile || merged.sponsorOnboardingComplete || merged.brandProfileCompletedAt),
    sponsorOnboardingStatus: String(merged.sponsorOnboardingStatus || "not_started"),
    sponsorVerificationStatus: normalizeSponsorReviewStatus(merged.sponsorVerificationStatus),
    businessEmail: String(merged.businessEmail || email || "")
  };
}

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;

  const db = getAdminDb();
  if (!db) return serverUnavailable("Sponsor profile");

  try {
    const context = await loadSponsorContext(db, user.uid);
    const sponsorError = assertSponsorAccount(context.userData, context.profileData);
    if (sponsorError) return sponsorError;

    return ok({
      profileExists: context.sponsorExists,
      sponsorProfile: toSponsorProfile(user.uid, user.email, context.userData, context.profileData, context.sponsorData)
    }, "Sponsor profile loaded.");
  } catch (error) {
    console.error("[sponsor-profile:get]", { userId: user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor profile could not be loaded.", { stage: "sponsor-profile:get" });
  }
}

export async function PATCH(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;

  const db = getAdminDb();
  if (!db) return serverUnavailable("Sponsor profile");

  const parsedBody = await readJson(request);
  if (parsedBody.response) return parsedBody.response;

  const parsed = sponsorProfileSchema.safeParse(parsedBody.body);
  if (!parsed.success) return validationError(fieldErrorsFromZod(parsed.error));

  try {
    const context = await loadSponsorContext(db, user.uid);
    const sponsorError = assertSponsorAccount(context.userData, context.profileData);
    if (sponsorError) return sponsorError;

    const input: SponsorProfileInput = parsed.data;
    const now = new Date().toISOString();
    const brandSlug = slugify(input.brandName);
    const currentVerificationStatus = normalizeSponsorReviewStatus({
      ...context.profileData,
      ...context.userData,
      ...context.sponsorData
    }.sponsorVerificationStatus);
    if (currentVerificationStatus === "suspended") {
      return forbidden("Suspended sponsor profiles cannot be changed. Contact support.");
    }
    const sponsorVerificationStatus = input.reviewAction === "submit"
      ? currentVerificationStatus === "approved" ? "approved" : "pending_review"
      : currentVerificationStatus === "not_submitted" ? "draft" : currentVerificationStatus;
    const sponsorProfile = {
      userId: user.uid,
      accountType: "sponsor",
      dashboardType: "sponsor_dashboard",
      sponsorOnboardingStatus: "complete",
      hasSponsorProfile: true,
      sponsorVerificationStatus,
      sponsorSubmittedAt: input.reviewAction === "submit" && currentVerificationStatus !== "approved" ? now : context.sponsorData.sponsorSubmittedAt ?? null,
      brandName: input.brandName,
      brandSlug,
      industry: input.industry,
      website: cleanOptionalUrl(input.website),
      countryLocation: input.countryLocation,
      brandDescription: input.brandDescription,
      socialLinks: input.socialLinks,
      contactPerson: input.contactPerson,
      businessEmail: input.businessEmail,
      logoUrl: cleanOptionalUrl(input.logoUrl),
      bannerUrl: cleanOptionalUrl(input.bannerUrl),
      ctaButtonText: input.ctaButtonText,
      ctaDestinationLink: input.ctaDestinationLink,
      sponsorshipGoals: input.sponsorshipGoals,
      preferredChallengeCategories: input.preferredChallengeCategories,
      brandProfileCompletedAt: context.sponsorData.brandProfileCompletedAt ?? now,
      updatedAt: now
    };

    const accountStatusFields = {
      accountType: "sponsor",
      dashboardType: "sponsor_dashboard",
      sponsorOnboardingStatus: "complete",
      hasSponsorProfile: true,
      sponsorVerificationStatus: sponsorProfile.sponsorVerificationStatus,
      brandName: sponsorProfile.brandName,
      brandSlug,
      brandProfileCompletedAt: sponsorProfile.brandProfileCompletedAt,
      updatedAt: now
    };

    await Promise.all([
      db.collection("sponsorProfiles").doc(user.uid).set(sponsorProfile, { merge: true }),
      db.collection("users").doc(user.uid).set(accountStatusFields, { merge: true }),
      db.collection("profiles").doc(user.uid).set(accountStatusFields, { merge: true })
    ]);

    return ok(
      { sponsorProfile },
      input.reviewAction === "submit"
        ? currentVerificationStatus === "approved" ? "Approved sponsor profile updated." : "Sponsor profile submitted for review."
        : "Sponsor profile saved. Submit it when you are ready for review."
    );
  } catch (error) {
    console.error("[sponsor-profile:patch]", { userId: user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor profile could not be saved.", { stage: "sponsor-profile:patch" });
  }
}


