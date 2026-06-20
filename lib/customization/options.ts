import type { ProductPlanId } from "@/lib/plan-access";

export type CustomizationCategory = "theme" | "accentColor" | "badge" | "avatarRing" | "profileFrame" | "dashboardStyle" | "cardStyle" | "celebrationEffect" | "creatorBranding" | "verifiedHostBranding";

export interface CustomizationOption {
  id: string;
  name: string;
  category: CustomizationCategory;
  requiredPlan: ProductPlanId;
  previewClass: string;
}

export interface ProfileCustomization {
  appThemeId: string;
  accentColorId: string;
  profileBadgeId: string;
  profileFrameId: string;
  avatarRingId: string;
  dashboardStyleId: string;
  cardStyleId: string;
  celebrationEffectId: string;
  profileBannerUrl?: string;
  profileTagline?: string;
  publicProfileThemeId?: string;
  creatorBrandColorId?: string;
  creatorLogoUrl?: string;
  hostBadgeStyleId?: string;
}

export const defaultCustomization: ProfileCustomization = {
  appThemeId: "default_black_gold",
  accentColorId: "gold",
  profileBadgeId: "free_member",
  profileFrameId: "default",
  avatarRingId: "none",
  dashboardStyleId: "classic_dark",
  cardStyleId: "classic_dark",
  celebrationEffectId: "none",
  profileTagline: ""
};

export const customizationOptions = {
  themes: [
    { id: "default_black_gold", name: "Default Black Gold", category: "theme", requiredPlan: "free", previewClass: "bg-black border-yellow-400" },
    { id: "midnight_arena", name: "Midnight Arena", category: "theme", requiredPlan: "premium", previewClass: "bg-slate-950 border-indigo-400" },
    { id: "royal_purple_gold", name: "Royal Purple Gold", category: "theme", requiredPlan: "premium", previewClass: "bg-purple-950 border-yellow-400" },
    { id: "neon_champion", name: "Neon Champion", category: "theme", requiredPlan: "premium", previewClass: "bg-cyan-950 border-cyan-300" },
    { id: "platinum_minimal", name: "Platinum Minimal", category: "theme", requiredPlan: "premium", previewClass: "bg-zinc-900 border-zinc-200" },
    { id: "creator_studio", name: "Creator Studio", category: "theme", requiredPlan: "creator_pro", previewClass: "bg-[#17111f] border-fuchsia-300" },
    { id: "verified_host_elite", name: "Verified Host Elite", category: "theme", requiredPlan: "verified_host", previewClass: "bg-[#10140f] border-emerald-300" }
  ],
  accentColors: [
    { id: "gold", name: "Gold", category: "accentColor", requiredPlan: "free", previewClass: "bg-yellow-300" },
    { id: "purple", name: "Purple", category: "accentColor", requiredPlan: "premium", previewClass: "bg-purple-400" },
    { id: "emerald", name: "Emerald", category: "accentColor", requiredPlan: "premium", previewClass: "bg-emerald-400" },
    { id: "electric_blue", name: "Electric Blue", category: "accentColor", requiredPlan: "premium", previewClass: "bg-blue-400" },
    { id: "crimson", name: "Crimson", category: "accentColor", requiredPlan: "creator_pro", previewClass: "bg-red-500" },
    { id: "platinum", name: "Platinum", category: "accentColor", requiredPlan: "verified_host", previewClass: "bg-zinc-200" }
  ],
  badges: [
    { id: "free_member", name: "Free Member", category: "badge", requiredPlan: "free", previewClass: "border-white/20 bg-white/5 text-slate-300" },
    { id: "premium_gold", name: "Premium Gold", category: "badge", requiredPlan: "premium", previewClass: "border-yellow-400/40 bg-yellow-400/15 text-yellow-200" },
    { id: "premium_diamond", name: "Premium Diamond", category: "badge", requiredPlan: "premium", previewClass: "border-sky-300/40 bg-sky-300/15 text-sky-200" },
    { id: "creator_pro", name: "Creator Pro", category: "badge", requiredPlan: "creator_pro", previewClass: "border-fuchsia-300/40 bg-fuchsia-400/15 text-fuchsia-200" },
    { id: "top_voter", name: "Top Voter", category: "badge", requiredPlan: "premium", previewClass: "border-emerald-300/40 bg-emerald-400/15 text-emerald-200" },
    { id: "rising_star", name: "Rising Star", category: "badge", requiredPlan: "premium", previewClass: "border-orange-300/40 bg-orange-400/15 text-orange-200" },
    { id: "verified_host", name: "Verified Host", category: "badge", requiredPlan: "verified_host", previewClass: "border-emerald-300/40 bg-emerald-400/15 text-emerald-200" },
    { id: "elite_host", name: "Elite Host", category: "badge", requiredPlan: "verified_host", previewClass: "border-amber-200/50 bg-emerald-400/15 text-amber-100" }
  ],
  avatarRings: [
    { id: "none", name: "None", category: "avatarRing", requiredPlan: "free", previewClass: "border-white/10" },
    { id: "gold_ring", name: "Gold Ring", category: "avatarRing", requiredPlan: "premium", previewClass: "border-yellow-300" },
    { id: "purple_glow", name: "Purple Glow", category: "avatarRing", requiredPlan: "premium", previewClass: "border-purple-300 shadow-[0_0_24px_rgba(168,85,247,.35)]" },
    { id: "diamond_ring", name: "Diamond Ring", category: "avatarRing", requiredPlan: "premium", previewClass: "border-sky-200" },
    { id: "creator_ring", name: "Creator Ring", category: "avatarRing", requiredPlan: "creator_pro", previewClass: "border-fuchsia-300" },
    { id: "verified_host_ring", name: "Verified Host Ring", category: "avatarRing", requiredPlan: "verified_host", previewClass: "border-emerald-300" }
  ],
  profileFrames: [
    { id: "default", name: "Default", category: "profileFrame", requiredPlan: "free", previewClass: "border-white/10" },
    { id: "gold_edge", name: "Gold Edge", category: "profileFrame", requiredPlan: "premium", previewClass: "border-yellow-400/50" },
    { id: "premium_glow", name: "Premium Glow", category: "profileFrame", requiredPlan: "premium", previewClass: "border-sky-300/40 shadow-[0_0_24px_rgba(125,211,252,.18)]" },
    { id: "creator_studio_frame", name: "Creator Studio Frame", category: "profileFrame", requiredPlan: "creator_pro", previewClass: "border-fuchsia-300/50" },
    { id: "verified_host_frame", name: "Verified Host Frame", category: "profileFrame", requiredPlan: "verified_host", previewClass: "border-emerald-300/50" }
  ],
  dashboardStyles: [
    { id: "classic_dark", name: "Classic Dark", category: "dashboardStyle", requiredPlan: "free", previewClass: "bg-[#121212]" },
    { id: "gold_accent", name: "Gold Accent", category: "dashboardStyle", requiredPlan: "premium", previewClass: "bg-yellow-400/10" },
    { id: "compact_pro", name: "Compact Pro", category: "dashboardStyle", requiredPlan: "premium", previewClass: "bg-[#171717]" },
    { id: "glass_arena", name: "Glass Arena", category: "dashboardStyle", requiredPlan: "premium", previewClass: "bg-white/10" },
    { id: "creator_studio", name: "Creator Studio", category: "dashboardStyle", requiredPlan: "creator_pro", previewClass: "bg-fuchsia-400/10" },
    { id: "host_elite", name: "Host Elite", category: "dashboardStyle", requiredPlan: "verified_host", previewClass: "bg-emerald-400/10" }
  ],
  celebrationEffects: [
    { id: "none", name: "None", category: "celebrationEffect", requiredPlan: "free", previewClass: "bg-white/5" },
    { id: "gold_spark", name: "Gold Spark", category: "celebrationEffect", requiredPlan: "premium", previewClass: "bg-yellow-400/20" },
    { id: "trophy_pulse", name: "Trophy Pulse", category: "celebrationEffect", requiredPlan: "premium", previewClass: "bg-orange-400/20" },
    { id: "confetti_light", name: "Confetti Light", category: "celebrationEffect", requiredPlan: "premium", previewClass: "bg-sky-400/20" },
    { id: "champion_glow", name: "Champion Glow", category: "celebrationEffect", requiredPlan: "creator_pro", previewClass: "bg-fuchsia-400/20" }
  ]
} satisfies Record<string, CustomizationOption[]>;

export const allCustomizationOptions = Object.values(customizationOptions).flat();

export function findCustomizationOption(id: string | undefined, category?: CustomizationCategory) {
  return allCustomizationOptions.find((option) => option.id === id && (!category || option.category === category)) ?? null;
}

