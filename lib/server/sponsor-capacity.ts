export type SponsorCapacityTerms = {
  role: "primary" | "supporting";
  category: string;
  categoryExclusive: boolean;
  placements: string[];
};

type SponsorOccupancy = {
  totalCount?: number;
  primaryCount?: number;
  categories?: Record<string, { count?: number; exclusiveSponsorId?: string | null }>;
  placements?: Record<string, number>;
};

function key(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
}

function count(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : 0;
}

export function normalizeSponsorCapacityTerms(value: Record<string, unknown>): SponsorCapacityTerms {
  const role = value.sponsorRole === "primary" ? "primary" : "supporting";
  const category = key(value.sponsorCategory);
  const placements = Array.isArray(value.requestedPlacements)
    ? [...new Set(value.requestedPlacements.map(key).filter(Boolean))].slice(0, 12)
    : [];
  return { role, category, categoryExclusive: value.categoryExclusive === true, placements };
}

export function reserveSponsorCapacity(input: {
  sponsorId: string;
  challenge: Record<string, unknown>;
  occupancy?: SponsorOccupancy;
  terms: SponsorCapacityTerms;
}) {
  const current = input.occupancy ?? {};
  const totalCount = count(current.totalCount);
  const primaryCount = count(current.primaryCount);
  const totalLimit = count(input.challenge.sponsorSlots);
  if (totalLimit && totalCount >= totalLimit) return { ok: false as const, code: "SPONSOR_SLOTS_FULL" };
  if (input.terms.role === "primary" && primaryCount >= 1) return { ok: false as const, code: "PRIMARY_SPONSOR_UNAVAILABLE" };

  const categories = { ...(current.categories ?? {}) };
  if (input.terms.category) {
    const category = categories[input.terms.category] ?? {};
    const categoryCount = count(category.count);
    if (category.exclusiveSponsorId && category.exclusiveSponsorId !== input.sponsorId) return { ok: false as const, code: "SPONSOR_CATEGORY_EXCLUSIVE" };
    if (input.terms.categoryExclusive && categoryCount > 0) return { ok: false as const, code: "SPONSOR_CATEGORY_EXCLUSIVE" };
    categories[input.terms.category] = {
      count: categoryCount + 1,
      exclusiveSponsorId: input.terms.categoryExclusive ? input.sponsorId : category.exclusiveSponsorId ?? null
    };
  }

  const configured = input.challenge.sponsorPlacementCapacities && typeof input.challenge.sponsorPlacementCapacities === "object"
    ? input.challenge.sponsorPlacementCapacities as Record<string, unknown>
    : {};
  const placements = { ...(current.placements ?? {}) };
  for (const placement of input.terms.placements) {
    const used = count(placements[placement]);
    const limit = count(configured[placement]);
    if (limit && used >= limit) return { ok: false as const, code: "SPONSOR_PLACEMENT_FULL", placement };
    placements[placement] = used + 1;
  }

  return {
    ok: true as const,
    occupancy: {
      totalCount: totalCount + 1,
      primaryCount: primaryCount + (input.terms.role === "primary" ? 1 : 0),
      categories,
      placements
    }
  };
}

export function releaseSponsorCapacity(input: { sponsorId: string; occupancy?: SponsorOccupancy; terms: SponsorCapacityTerms }) {
  const current = input.occupancy ?? {};
  const categories = { ...(current.categories ?? {}) };
  if (input.terms.category && categories[input.terms.category]) {
    const category = categories[input.terms.category];
    const nextCount = Math.max(0, count(category.count) - 1);
    categories[input.terms.category] = { count: nextCount, exclusiveSponsorId: category.exclusiveSponsorId === input.sponsorId ? null : category.exclusiveSponsorId ?? null };
  }
  const placements = { ...(current.placements ?? {}) };
  input.terms.placements.forEach((placement) => { placements[placement] = Math.max(0, count(placements[placement]) - 1); });
  return { totalCount: Math.max(0, count(current.totalCount) - 1), primaryCount: Math.max(0, count(current.primaryCount) - (input.terms.role === "primary" ? 1 : 0)), categories, placements };
}
