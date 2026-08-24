export { NORMAL_CHALLENGE_MAX_STEP, NORMAL_CHALLENGE_STEPS } from "@/lib/challenge-builder-foundation";
export const NORMAL_CHALLENGE_BUILDER_VERSION = "normal_v2";

export const NORMAL_CHALLENGE_CATEGORIES = [
  { label: "Fitness", subcategories: ["Strength", "Endurance", "Wellness"] },
  { label: "Gaming", subcategories: ["Console", "PC", "Mobile"] },
  { label: "Design & Creative", subcategories: ["Graphic Design", "Illustration", "Product Design"] },
  { label: "Music Making", subcategories: ["Performance", "Production", "Songwriting"] },
  { label: "Photography", subcategories: ["Portrait", "Commercial", "Documentary"] },
  { label: "Food", subcategories: ["Cooking", "Baking", "Food Styling"] },
  { label: "Education", subcategories: ["Academic", "Skills", "Research"] },
  { label: "Business", subcategories: ["Pitch", "Marketing", "Entrepreneurship"] },
  { label: "Development & IT", subcategories: ["Web", "Mobile", "Data"] },
  { label: "Fashion & Modelling", subcategories: ["Fashion Design", "Styling", "Modelling"] }
] as const;

export const NORMAL_ELIGIBLE_COUNTRIES = [
  ["US", "United States"], ["CA", "Canada"], ["MX", "Mexico"], ["GB", "United Kingdom"],
  ["NG", "Nigeria"], ["GH", "Ghana"], ["ZA", "South Africa"], ["KE", "Kenya"],
  ["FR", "France"], ["ES", "Spain"], ["PT", "Portugal"], ["DE", "Germany"],
  ["BR", "Brazil"], ["IN", "India"], ["AU", "Australia"], ["NZ", "New Zealand"]
] as const;

export function isCanonicalChallengeCategory(category: string) {
  return NORMAL_CHALLENGE_CATEGORIES.some((item) => item.label === category);
}

export function isCanonicalChallengeSubcategory(category: string, subcategory: string) {
  const match = NORMAL_CHALLENGE_CATEGORIES.find((item) => item.label === category);
  return Boolean(match && match.subcategories.some((item) => item === subcategory));
}

export const NORMAL_RESUBMIT_WINDOWS = [12, 24, 48, 72] as const;
export const NORMAL_PRIZE_SPLITS: Record<number, number[]> = { 1: [100], 2: [70, 30], 3: [50, 30, 20] };

export const NORMAL_MEDIA_LIMITS = {
  imageCount: 3,
  imageBytes: 5 * 1024 * 1024,
  imageMinWidth: 712,
  imageMinHeight: 430,
  imageMaxWidth: 4000,
  imageMaxHeight: 2416,
  videoCount: 1,
  videoBytes: 50 * 1024 * 1024,
  videoMinWidth: 1280,
  videoMinHeight: 720,
  videoMaxDurationSeconds: 75
} as const;

export function isNormalChallengeV2(value: Record<string, unknown>) {
  return String(value.builderVersion ?? "") === NORMAL_CHALLENGE_BUILDER_VERSION;
}
