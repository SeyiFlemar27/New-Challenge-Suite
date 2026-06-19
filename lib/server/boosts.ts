export const boostPackages = {
  spark: { id: "spark", name: "Spark Boost", coins: 40, reach: "1,200 estimated views", durationDays: 2 },
  surge: { id: "surge", name: "Surge Boost", coins: 90, reach: "4,800 estimated views", durationDays: 5 },
  spotlight: { id: "spotlight", name: "Spotlight Boost", coins: 180, reach: "12,000 estimated views", durationDays: 7 }
} as const;

export function getBoostPackage(packageId: unknown) {
  if (typeof packageId !== "string") return null;
  return boostPackages[packageId as keyof typeof boostPackages] ?? null;
}
