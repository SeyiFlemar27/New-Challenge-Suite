/** Search prefixes used by Firestore array-contains queries for public entries. */
export function leaderboardSearchPrefixes(...values: unknown[]) {
  const terms = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = value.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ");
    if (!normalized) continue;
    const pieces = [normalized, ...normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean)];
    for (const piece of pieces) {
      const bounded = piece.slice(0, 40);
      for (let length = 2; length <= bounded.length; length += 1) terms.add(bounded.slice(0, length));
    }
  }
  return [...terms].slice(0, 200);
}

export function normalizeLeaderboardSearch(value: unknown) {
  return typeof value === "string"
    ? value.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ").slice(0, 40)
    : "";
}
