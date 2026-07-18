import { getUserPlanAccess, type PlanAccess, type ProductPlanId } from "@/lib/plan-access";
import { defaultCustomization, findCustomizationOption, type CustomizationCategory, type ProfileCustomization } from "./options";

const planRank: Record<ProductPlanId, number> = { free: 0, premium: 1, creator_pro: 2, verified_host: 3 };

export function getCustomizationAccess(profile: Record<string, unknown> = {}) {
  const plan = getUserPlanAccess(profile);
  return {
    ...plan,
    canUsePremiumCustomization: planRank[plan.planId] >= planRank.premium,
    canUseCreatorBranding: plan.canUseAdvancedAnalytics,
    canUseVerifiedHostBranding: plan.canHostLiveEvents
  };
}

export function canUseOption(plan: PlanAccess, optionId: string | undefined, category: CustomizationCategory) {
  const option = findCustomizationOption(optionId, category);
  if (!option) return { allowed: false, code: "CUSTOMIZATION_NOT_ALLOWED", message: "Selected customization option is not available." };
  if (planRank[plan.planId] < planRank[option.requiredPlan]) {
    const code = option.requiredPlan === "verified_host" ? "VERIFIED_HOST_REQUIRED" : option.requiredPlan === "creator_pro" ? "CREATOR_PRO_REQUIRED" : "PREMIUM_REQUIRED";
    return { allowed: false, code, message: `${option.name} requires ${option.requiredPlan.replace("_", " ")}.` };
  }
  return { allowed: true, code: null, message: "Customization allowed." };
}

export function canUseTheme(profile: Record<string, unknown>, themeId: string) {
  return canUseOption(getCustomizationAccess(profile), themeId, "theme");
}

export function canUseBadge(profile: Record<string, unknown>, badgeId: string) {
  return canUseOption(getCustomizationAccess(profile), badgeId, "badge");
}

export function canUseProfileFrame(profile: Record<string, unknown>, frameId: string) {
  return canUseOption(getCustomizationAccess(profile), frameId, "profileFrame");
}

export function canUseCreatorBranding(profile: Record<string, unknown>) {
  return getCustomizationAccess(profile).canUseCreatorBranding;
}

export function canUseVerifiedHostBranding(profile: Record<string, unknown>) {
  return getCustomizationAccess(profile).canUseVerifiedHostBranding;
}

export function sanitizeCustomization(input: Partial<ProfileCustomization> | null | undefined): ProfileCustomization {
  return {
    ...defaultCustomization,
    ...(input && typeof input === "object" ? input : {}),
    profileBannerUrl: "",
    creatorLogoUrl: "",
    profileTagline: typeof input?.profileTagline === "string" ? input.profileTagline.slice(0, 120) : defaultCustomization.profileTagline
  };
}

export function validateCustomizationForProfile(profile: Record<string, unknown>, customization: ProfileCustomization) {
  const plan = getCustomizationAccess(profile);
  const checks = [
    canUseOption(plan, customization.appThemeId, "theme"),
    canUseOption(plan, customization.accentColorId, "accentColor"),
    canUseOption(plan, customization.profileBadgeId, "badge"),
    canUseOption(plan, customization.avatarRingId, "avatarRing"),
    canUseOption(plan, customization.profileFrameId, "profileFrame"),
    canUseOption(plan, customization.dashboardStyleId, "dashboardStyle"),
    canUseOption(plan, customization.cardStyleId, "dashboardStyle"),
    canUseOption(plan, customization.celebrationEffectId, "celebrationEffect"),
    canUseOption(plan, customization.voteEffectId, "celebrationEffect")
  ];
  const denied = checks.find((check) => !check.allowed);
  if (denied) return denied;
  if ((customization.publicProfileThemeId || customization.creatorBrandColorId) && !plan.canUseCreatorBranding) return { allowed: false, code: "CREATOR_PRO_REQUIRED", message: "Creator branding requires Creator Pro." };
  if (customization.hostBadgeStyleId && !plan.canUseVerifiedHostBranding) return { allowed: false, code: "HOST_BADGE_REQUIRED", message: "Host branding requires eligible host access." };
  return { allowed: true, code: null, message: "Customization allowed." };
}
