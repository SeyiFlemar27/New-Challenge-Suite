import { getAdminDb } from "@/lib/firebase/admin";
import { normalizeAccountType } from "@/lib/plan-access";
import { calculateSponsorCompletion, normalizeBusinessVerificationStatus } from "@/lib/sponsor-foundation";
import { requireAdminUser, requireRequestUser } from "@/lib/server/auth";
import { forbidden, ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { normalizeSponsorReviewStatus } from "@/lib/sponsor-access";
import { sponsorMediaPath } from "@/lib/media-upload-paths";
import { z } from "zod";

export const dynamic = "force-dynamic";

function normalizeUrl(value: unknown) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

const optionalText = (max = 240) => z.string().trim().max(max).optional().or(z.literal(""));
const optionalUrl = z.preprocess(normalizeUrl, z.string().trim().url("Enter a valid URL.").optional().or(z.literal("")));
const safeStringArray = z.array(z.string().trim().min(1).max(120)).max(30).default([]);

const sponsorProfileSchema = z.object({
  brandName: z.string().trim().min(2, "Brand name is required.").max(120),
  legalBusinessName: optionalText(160),
  industry: z.string().trim().min(2, "Industry/category is required.").max(100),
  companySize: optionalText(80),
  businessType: optionalText(100),
  businessRegistrationCountry: optionalText(120),
  headquartersLocation: optionalText(160),
  website: optionalUrl,
  countryLocation: z.string().trim().min(2, "Country/location is required.").max(120),
  brandDescription: z.string().trim().min(20, "Brand description should be at least 20 characters.").max(1600),
  socialLinks: z.array(z.preprocess(normalizeUrl, z.string().trim().url("Each social link must be a valid URL."))).max(12).default([]),
  contactPerson: optionalText(120),
  businessEmail: z.string().trim().email("Enter a valid business email."),
  phoneNumber: optionalText(40),
  logoUrl: optionalUrl,
  logoPath: optionalText(500),
  alternateLogoUrl: optionalUrl,
  alternateLogoPath: optionalText(500),
  squareIconUrl: optionalUrl,
  squareIconPath: optionalText(500),
  bannerUrl: optionalUrl,
  bannerPath: optionalText(500),
  coverImageUrl: optionalUrl,
  coverImagePath: optionalText(500),
  brandColors: safeStringArray,
  brandFonts: safeStringArray,
  brandTone: optionalText(80),
  approvedHashtags: safeStringArray,
  preferredCtaLabels: safeStringArray,
  ctaButtonText: z.string().trim().min(2, "CTA button text is required.").max(40).transform((value) => value.replace(/[<>]/g, "")),
  ctaDestinationLink: optionalUrl,
  sponsorshipGoals: z.array(z.string().trim().min(1)).min(1, "Select at least one sponsorship goal.").max(12),
  preferredChallengeCategories: z.array(z.string().trim().min(1)).min(1, "Select at least one preferred category.").max(16),
  targetCountries: safeStringArray,
  targetRegions: safeStringArray,
  targetAgeRange: optionalText(80),
  genderPreference: optionalText(80),
  languages: safeStringArray,
  interests: safeStringArray,
  preferredCreatorNiches: safeStringArray,
  preferredAudienceSize: optionalText(100),
  typicalCampaignBudget: optionalText(100),
  preferredSponsorshipStructure: optionalText(140),
  preferredPaymentCurrency: optionalText(20),
  preferredCampaignDuration: optionalText(100),
  milestonePaymentsRequired: z.boolean().optional().default(false),
  legalApprovalRequired: z.boolean().optional().default(false),
  publicProfile: z.boolean().optional().default(false),
  notificationPreferences: z.record(z.string(), z.boolean()).optional().default({}),
  reviewAction: z.enum(["save", "submit"]).default("save")
});

type SponsorProfileInput = z.infer<typeof sponsorProfileSchema>;

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "brand";
}

function cleanOptionalUrl(value: string | undefined) {
  return value && value.trim() ? value.trim() : null;
}

function cleanList(values: string[] | undefined) {
  return Array.isArray(values) ? values.map((value) => value.trim()).filter(Boolean) : [];
}

function fieldErrorsFromZod(error: z.ZodError) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "profile");
    fieldErrors[field] = issue.message;
  }
  return fieldErrors;
}

function invalidSponsorMediaPath(userId: string, path: string, folder: "logo" | "banner") {
  if (!path) return false;
  const expected = sponsorMediaPath(userId, folder) + "/";
  return !path.startsWith(expected) || /^https?:/i.test(path) || path.includes("..");
}

function defaultSponsorProfile(userId: string, email?: string) {
  return {
    userId,
    accountType: "sponsor",
    dashboardType: "sponsor_dashboard",
    sponsorOnboardingStatus: "not_started",
    sponsorOnboardingComplete: false,
    onboardingCompletionPercent: 0,
    hasSponsorProfile: false,
    sponsorVerificationStatus: "not_submitted",
    businessVerificationStatus: "not_started",
    restrictedActions: ["funding_campaigns", "verified_badge", "high_value_sponsorship_tools", "payment_release_actions", "enterprise_sponsorship_tools"],
    brandName: "",
    brandSlug: "",
    industry: "",
    website: null,
    countryLocation: "",
    headquartersLocation: "",
    brandDescription: "",
    socialLinks: [],
    contactPerson: "",
    businessEmail: email ?? "",
    phoneNumber: "",
    logoUrl: null,
    logoPath: "",
    alternateLogoUrl: null,
    alternateLogoPath: "",
    squareIconUrl: null,
    squareIconPath: "",
    bannerUrl: null,
    bannerPath: "",
    coverImageUrl: null,
    coverImagePath: "",
    brandColors: [],
    brandFonts: [],
    brandTone: "",
    approvedHashtags: [],
    preferredCtaLabels: ["Learn More"],
    ctaButtonText: "Learn More",
    ctaDestinationLink: "",
    sponsorshipGoals: [],
    preferredChallengeCategories: [],
    targetCountries: [],
    targetRegions: [],
    targetAgeRange: "",
    genderPreference: "",
    languages: [],
    interests: [],
    preferredCreatorNiches: [],
    preferredAudienceSize: "",
    typicalCampaignBudget: "",
    preferredSponsorshipStructure: "",
    preferredPaymentCurrency: "USD",
    preferredCampaignDuration: "",
    milestonePaymentsRequired: false,
    legalApprovalRequired: false,
    publicProfile: false,
    notificationPreferences: {},
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
  if (accountType !== "sponsor") return forbidden("A sponsor account is required for the Brand Command Center.");
  return null;
}

function toSponsorProfile(uid: string, email: string | undefined, userData: Record<string, unknown>, profileData: Record<string, unknown>, sponsorData: Record<string, unknown>) {
  const fallback = defaultSponsorProfile(uid, email);
  const merged = { ...fallback, ...profileData, ...userData, ...sponsorData };
  const completion = Number(merged.onboardingCompletionPercent ?? calculateSponsorCompletion(merged));
  return {
    ...merged,
    userId: uid,
    accountType: "sponsor",
    dashboardType: "sponsor_dashboard",
    hasSponsorProfile: Boolean(merged.hasSponsorProfile || merged.sponsorOnboardingComplete || merged.brandProfileCompletedAt),
    sponsorOnboardingStatus: String(merged.sponsorOnboardingStatus || "not_started"),
    sponsorVerificationStatus: normalizeSponsorReviewStatus(merged.sponsorVerificationStatus),
    businessVerificationStatus: normalizeBusinessVerificationStatus(merged.businessVerificationStatus ?? merged.sponsorVerificationStatus),
    onboardingCompletionPercent: completion,
    businessEmail: String(merged.businessEmail || email || "")
  };
}

async function writeSponsorActivity(db: FirebaseFirestore.Firestore, userId: string, action: string, details: Record<string, unknown>) {
  const now = new Date().toISOString();
  await db.collection("sponsorActivity").add({ userId, action, details, createdAt: now, source: "sponsor_profile_api" });
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
    return ok({ profileExists: context.sponsorExists, sponsorProfile: toSponsorProfile(user.uid, user.email, context.userData, context.profileData, context.sponsorData) }, "Sponsor profile loaded.");
  } catch (error) {
    console.error("[sponsor-profile:get]", { userId: user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor profile could not be loaded.", { stage: "sponsor-profile:get" });
  }
}

async function persistSponsorProfile(request: Request) {
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
    if (invalidSponsorMediaPath(user.uid, input.logoPath ?? "", "logo")) return validationError({ logoPath: "Sponsor logo must be uploaded to your authenticated sponsor media path." });
    if (invalidSponsorMediaPath(user.uid, input.bannerPath ?? "", "banner")) return validationError({ bannerPath: "Sponsor banner must be uploaded to your authenticated sponsor media path." });
    if (invalidSponsorMediaPath(user.uid, input.coverImagePath ?? "", "banner")) return validationError({ coverImagePath: "Sponsor cover image must be uploaded to your authenticated sponsor banner path." });
    const now = new Date().toISOString();
    const brandSlug = slugify(input.brandName);
    const currentVerificationStatus = normalizeSponsorReviewStatus({ ...context.profileData, ...context.userData, ...context.sponsorData }.sponsorVerificationStatus);
    if (currentVerificationStatus === "suspended" || currentVerificationStatus === "flagged") return forbidden("Restricted sponsor profiles cannot be changed. Contact support.");

    const sponsorVerificationStatus = input.reviewAction === "submit"
      ? currentVerificationStatus === "approved" || currentVerificationStatus === "verified" ? currentVerificationStatus : "pending_review"
      : currentVerificationStatus === "not_submitted" ? "draft" : currentVerificationStatus;
    const businessVerificationStatus = input.reviewAction === "submit"
      ? currentVerificationStatus === "approved" || currentVerificationStatus === "verified" ? "verified" : "submitted"
      : normalizeBusinessVerificationStatus(context.sponsorData.businessVerificationStatus ?? sponsorVerificationStatus);

    const sponsorProfile = {
      userId: user.uid,
      accountType: "sponsor",
      dashboardType: "sponsor_dashboard",
      sponsorOnboardingStatus: "complete",
      sponsorOnboardingComplete: true,
      hasSponsorProfile: true,
      sponsorVerificationStatus,
      businessVerificationStatus,
      sponsorSubmittedAt: input.reviewAction === "submit" && currentVerificationStatus !== "approved" && currentVerificationStatus !== "verified" ? now : context.sponsorData.sponsorSubmittedAt ?? null,
      brandName: input.brandName,
      legalBusinessName: input.legalBusinessName ?? "",
      brandSlug,
      industry: input.industry,
      companySize: input.companySize ?? "",
      businessType: input.businessType ?? "",
      businessRegistrationCountry: input.businessRegistrationCountry ?? "",
      headquartersLocation: input.headquartersLocation ?? input.countryLocation,
      website: cleanOptionalUrl(input.website),
      countryLocation: input.countryLocation,
      brandDescription: input.brandDescription,
      socialLinks: cleanList(input.socialLinks),
      contactPerson: input.contactPerson ?? "",
      businessEmail: input.businessEmail,
      phoneNumber: input.phoneNumber ?? "",
      logoUrl: cleanOptionalUrl(input.logoUrl),
      logoPath: input.logoPath ?? "",
      alternateLogoUrl: cleanOptionalUrl(input.alternateLogoUrl),
      alternateLogoPath: input.alternateLogoPath ?? "",
      squareIconUrl: cleanOptionalUrl(input.squareIconUrl),
      squareIconPath: input.squareIconPath ?? "",
      bannerUrl: cleanOptionalUrl(input.bannerUrl),
      bannerPath: input.bannerPath ?? "",
      coverImageUrl: cleanOptionalUrl(input.coverImageUrl),
      coverImagePath: input.coverImagePath ?? "",
      brandColors: cleanList(input.brandColors),
      brandFonts: cleanList(input.brandFonts),
      brandTone: input.brandTone ?? "",
      approvedHashtags: cleanList(input.approvedHashtags),
      preferredCtaLabels: cleanList(input.preferredCtaLabels),
      ctaButtonText: input.ctaButtonText,
      ctaDestinationLink: cleanOptionalUrl(input.ctaDestinationLink),
      sponsorshipGoals: cleanList(input.sponsorshipGoals),
      preferredChallengeCategories: cleanList(input.preferredChallengeCategories),
      targetCountries: cleanList(input.targetCountries),
      targetRegions: cleanList(input.targetRegions),
      targetAgeRange: input.targetAgeRange ?? "",
      genderPreference: input.genderPreference ?? "",
      languages: cleanList(input.languages),
      interests: cleanList(input.interests),
      preferredCreatorNiches: cleanList(input.preferredCreatorNiches),
      preferredAudienceSize: input.preferredAudienceSize ?? "",
      typicalCampaignBudget: input.typicalCampaignBudget ?? "",
      preferredSponsorshipStructure: input.preferredSponsorshipStructure ?? "",
      preferredPaymentCurrency: input.preferredPaymentCurrency || "USD",
      preferredCampaignDuration: input.preferredCampaignDuration ?? "",
      milestonePaymentsRequired: input.milestonePaymentsRequired,
      legalApprovalRequired: input.legalApprovalRequired,
      publicProfile: input.publicProfile,
      notificationPreferences: input.notificationPreferences,
      restrictedActions: ["funding_campaigns", "verified_badge", "high_value_sponsorship_tools", "payment_release_actions", "enterprise_sponsorship_tools"],
      brandProfileCompletedAt: context.sponsorData.brandProfileCompletedAt ?? now,
      updatedAt: now,
      updatedBy: user.uid,
      version: Number(context.sponsorData.version ?? 0) + 1
    };
    const onboardingCompletionPercent = calculateSponsorCompletion(sponsorProfile);
    const finalSponsorProfile = { ...sponsorProfile, onboardingCompletionPercent };

    const accountStatusFields = {
      accountType: "sponsor",
      dashboardType: "sponsor_dashboard",
      sponsorOnboardingStatus: "complete",
      sponsorOnboardingComplete: true,
      onboardingCompletionPercent,
      hasSponsorProfile: true,
      sponsorVerificationStatus: finalSponsorProfile.sponsorVerificationStatus,
      businessVerificationStatus: finalSponsorProfile.businessVerificationStatus,
      brandName: finalSponsorProfile.brandName,
      brandSlug,
      brandProfileCompletedAt: finalSponsorProfile.brandProfileCompletedAt,
      updatedAt: now
    };

    await Promise.all([
      db.collection("sponsorProfiles").doc(user.uid).set(finalSponsorProfile, { merge: true }),
      db.collection("sponsorOnboarding").doc(user.uid).set({ userId: user.uid, status: "complete", completionPercent: onboardingCompletionPercent, updatedAt: now, updatedBy: user.uid }, { merge: true }),
      db.collection("sponsorSettings").doc(user.uid).set({ userId: user.uid, notificationPreferences: input.notificationPreferences, publicProfile: input.publicProfile, updatedAt: now, updatedBy: user.uid }, { merge: true }),
      db.collection("sponsorBrandAssets").doc(user.uid).set({ userId: user.uid, logoUrl: finalSponsorProfile.logoUrl, logoPath: finalSponsorProfile.logoPath, alternateLogoUrl: finalSponsorProfile.alternateLogoUrl, alternateLogoPath: finalSponsorProfile.alternateLogoPath, squareIconUrl: finalSponsorProfile.squareIconUrl, squareIconPath: finalSponsorProfile.squareIconPath, bannerUrl: finalSponsorProfile.bannerUrl, bannerPath: finalSponsorProfile.bannerPath, coverImageUrl: finalSponsorProfile.coverImageUrl, coverImagePath: finalSponsorProfile.coverImagePath, brandColors: finalSponsorProfile.brandColors, brandFonts: finalSponsorProfile.brandFonts, updatedAt: now, updatedBy: user.uid }, { merge: true }),
      db.collection("users").doc(user.uid).set(accountStatusFields, { merge: true }),
      db.collection("profiles").doc(user.uid).set(accountStatusFields, { merge: true }),
      writeSponsorActivity(db, user.uid, input.reviewAction === "submit" ? "sponsor_profile_submitted" : "sponsor_profile_saved", { brandName: input.brandName, businessVerificationStatus })
    ]);

    return ok({ sponsorProfile: finalSponsorProfile }, input.reviewAction === "submit" ? "Sponsor profile submitted for review." : "Sponsor profile saved.");
  } catch (error) {
    console.error("[sponsor-profile:patch]", { userId: user.uid, message: error instanceof Error ? error.message : String(error) });
    return serverError("Sponsor profile could not be saved.", { stage: "sponsor-profile:patch" });
  }
}

export async function POST(request: Request) {
  return persistSponsorProfile(request);
}

export async function PATCH(request: Request) {
  return persistSponsorProfile(request);
}

export async function PUT(request: Request) {
  return persistSponsorProfile(request);
}
