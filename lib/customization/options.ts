import type { ProductPlanId } from "@/lib/plan-access";

export type CustomizationCategory = "theme" | "accentColor" | "badge" | "avatarRing" | "profileFrame" | "dashboardStyle" | "cardStyle" | "celebrationEffect" | "creatorBranding" | "verifiedHostBranding";

export interface CustomizationOption {
  id: string;
  name: string;
  description?: string;
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
  voteEffectId?: string;
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
  voteEffectId: "default_vote",
  profileTagline: ""
};

export const customizationOptions = {
  themes: [
    { id: "default_black_gold", name: "Default Black Gold", description: "Challenge Suite's core arena look.", category: "theme", requiredPlan: "free", previewClass: "bg-[linear-gradient(135deg,#050505,#1d1a05)] border-yellow-400" },
    { id: "midnight_arena", name: "Midnight Arena", description: "Deep competitive darks with a cool arena edge.", category: "theme", requiredPlan: "premium", previewClass: "bg-[linear-gradient(135deg,#020617,#1e1b4b)] border-indigo-400" },
    { id: "royal_purple_gold", name: "Royal Purple Gold", description: "A regal profile treatment for premium members.", category: "theme", requiredPlan: "premium", previewClass: "bg-[linear-gradient(135deg,#2e1065,#f5d90a)] border-yellow-400" },
    { id: "neon_champion", name: "Neon Champion", description: "Electric highlights for high-energy competitors.", category: "theme", requiredPlan: "premium", previewClass: "bg-[linear-gradient(135deg,#06202a,#22d3ee)] border-cyan-300" },
    { id: "platinum_minimal", name: "Platinum Minimal", description: "Clean, restrained, and executive.", category: "theme", requiredPlan: "premium", previewClass: "bg-[linear-gradient(135deg,#18181b,#e4e4e7)] border-zinc-200" },
    { id: "creator_studio", name: "Creator Studio", description: "A richer creator-led brand surface.", category: "theme", requiredPlan: "creator_pro", previewClass: "bg-[linear-gradient(135deg,#17111f,#d946ef)] border-fuchsia-300" },
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
    { id: "free_member", name: "Free Member", description: "The default competitor identity badge.", category: "badge", requiredPlan: "free", previewClass: "border-white/20 bg-white/5 text-slate-300" },
    { id: "premium_gold", name: "Premium Star", description: "A glowing premium status marker.", category: "badge", requiredPlan: "premium", previewClass: "border-yellow-400/50 bg-yellow-400/15 text-yellow-200 shadow-[0_0_26px_rgba(245,217,10,.18)]" },
    { id: "premium_diamond", name: "Gold Diamond", description: "A collectible diamond badge for premium identity.", category: "badge", requiredPlan: "premium", previewClass: "border-sky-300/50 bg-sky-300/15 text-sky-200 shadow-[0_0_26px_rgba(125,211,252,.18)]" },
    { id: "creator_pro", name: "Creator Crown", description: "Signals advanced creator tools and monetization.", category: "badge", requiredPlan: "creator_pro", previewClass: "border-fuchsia-300/50 bg-fuchsia-400/15 text-fuchsia-200 shadow-[0_0_26px_rgba(217,70,239,.18)]" },
    { id: "top_voter", name: "Top Voter Flame", description: "A premium voting identity badge.", category: "badge", requiredPlan: "premium", previewClass: "border-orange-300/50 bg-orange-400/15 text-orange-200" },
    { id: "rising_star", name: "Rising Star Spark", description: "For emerging competitors and creators.", category: "badge", requiredPlan: "premium", previewClass: "border-amber-300/50 bg-amber-400/15 text-amber-100" },
  ],
  avatarRings: [
    { id: "none", name: "None", category: "avatarRing", requiredPlan: "free", previewClass: "border-white/10" },
    { id: "gold_ring", name: "Gold Ring", category: "avatarRing", requiredPlan: "premium", previewClass: "border-yellow-300" },
    { id: "purple_glow", name: "Purple Glow", category: "avatarRing", requiredPlan: "premium", previewClass: "border-purple-300 shadow-[0_0_24px_rgba(168,85,247,.35)]" },
    { id: "diamond_ring", name: "Diamond Ring", category: "avatarRing", requiredPlan: "premium", previewClass: "border-sky-200" },
    { id: "creator_ring", name: "Creator Ring", category: "avatarRing", requiredPlan: "creator_pro", previewClass: "border-fuchsia-300" },
  ],
  profileFrames: [
    { id: "default", name: "Default", category: "profileFrame", requiredPlan: "free", previewClass: "border-white/10" },
    { id: "gold_edge", name: "Gold Edge", category: "profileFrame", requiredPlan: "premium", previewClass: "border-yellow-400/50" },
    { id: "premium_glow", name: "Premium Glow", category: "profileFrame", requiredPlan: "premium", previewClass: "border-sky-300/40 shadow-[0_0_24px_rgba(125,211,252,.18)]" },
    { id: "creator_studio_frame", name: "Creator Studio Frame", category: "profileFrame", requiredPlan: "creator_pro", previewClass: "border-fuchsia-300/50" },
  ],
  dashboardStyles: [
    { id: "classic_dark", name: "Classic Dark", category: "dashboardStyle", requiredPlan: "free", previewClass: "bg-[#121212]" },
    { id: "gold_accent", name: "Gold Accent", category: "dashboardStyle", requiredPlan: "premium", previewClass: "bg-yellow-400/10" },
    { id: "compact_pro", name: "Compact Creator", category: "dashboardStyle", requiredPlan: "premium", previewClass: "bg-[#171717]" },
    { id: "glass_arena", name: "Glass Arena", category: "dashboardStyle", requiredPlan: "premium", previewClass: "bg-white/10" },
    { id: "creator_studio", name: "Creator Studio", category: "dashboardStyle", requiredPlan: "creator_pro", previewClass: "bg-fuchsia-400/10" },
  ],
  celebrationEffects: [
    { id: "none", name: "None", category: "celebrationEffect", requiredPlan: "free", previewClass: "bg-white/5" },
    { id: "gold_spark", name: "Gold Spark", category: "celebrationEffect", requiredPlan: "premium", previewClass: "bg-yellow-400/20" },
    { id: "trophy_pulse", name: "Trophy Pulse", category: "celebrationEffect", requiredPlan: "premium", previewClass: "bg-orange-400/20" },
    { id: "confetti_light", name: "Confetti Light", category: "celebrationEffect", requiredPlan: "premium", previewClass: "bg-sky-400/20" },
    { id: "champion_glow", name: "Champion Glow", category: "celebrationEffect", requiredPlan: "creator_pro", previewClass: "bg-fuchsia-400/20" },
    { id: "diamond_flash", name: "Diamond Flash", category: "celebrationEffect", requiredPlan: "premium", previewClass: "bg-cyan-300/20" }
  ],
  voteEffects: [
    { id: "default_vote", name: "Default Vote", description: "Standard vote confirmation.", category: "celebrationEffect", requiredPlan: "free", previewClass: "bg-white/5" },
    { id: "gold_vote", name: "Gold Vote", description: "Premium gold voting feedback.", category: "celebrationEffect", requiredPlan: "premium", previewClass: "bg-yellow-400/20" },
    { id: "fire_vote", name: "Fire Vote", description: "High-energy voting flare.", category: "celebrationEffect", requiredPlan: "premium", previewClass: "bg-orange-500/20" },
    { id: "diamond_vote", name: "Diamond Vote", description: "Diamond-style premium vote effect.", category: "celebrationEffect", requiredPlan: "premium", previewClass: "bg-sky-300/20" },
    { id: "crown_vote", name: "Crown Vote", description: "Creator celebration effect.", category: "celebrationEffect", requiredPlan: "creator_pro", previewClass: "bg-fuchsia-400/20" },
    { id: "champion_vote", name: "Champion Vote", description: "Elite host and champion vote treatment.", category: "celebrationEffect", requiredPlan: "verified_host", previewClass: "bg-emerald-400/20" }
  ]
} satisfies Record<string, CustomizationOption[]>;

export const allCustomizationOptions = Object.values(customizationOptions).flat();

export function findCustomizationOption(id: string | undefined, category?: CustomizationCategory) {
  return allCustomizationOptions.find((option) => option.id === id && (!category || option.category === category)) ?? null;
}
