export function challengeMediaDeliveryUrl(path: string) {
  return `/api/challenge-media?path=${encodeURIComponent(path)}`;
}

export function isFirebaseStorageDownloadUrl(value: unknown) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.hostname === "firebasestorage.googleapis.com"
      || url.hostname.endsWith(".storage.googleapis.com")
      || (url.pathname.includes("/v0/b/") && (url.searchParams.has("token") || url.searchParams.get("alt") === "media"));
  } catch {
    return false;
  }
}

export function challengeMediaPaths(challenge: Record<string, unknown>) {
  const paths = new Set<string>();
  for (const key of ["coverImagePath", "promoImagePath", "trailerVideoPath", "promoVideoPath"]) {
    const value = challenge[key];
    if (typeof value === "string" && value.trim()) paths.add(value.trim());
  }
  if (Array.isArray(challenge.challengeImages)) {
    for (const image of challenge.challengeImages) {
      if (!image || typeof image !== "object") continue;
      const path = (image as Record<string, unknown>).path;
      if (typeof path === "string" && path.trim()) paths.add(path.trim());
    }
  }
  if (challenge.challengeVideo && typeof challenge.challengeVideo === "object") {
    const path = (challenge.challengeVideo as Record<string, unknown>).path;
    if (typeof path === "string" && path.trim()) paths.add(path.trim());
  }
  return paths;
}

export function publicChallengeImagePaths(challenge: Record<string, unknown>) {
  const paths = new Set<string>();
  const cover = challenge.coverImagePath;
  if (typeof cover === "string" && cover.trim()) paths.add(cover.trim());
  if (Array.isArray(challenge.challengeImages)) {
    for (const image of challenge.challengeImages) {
      if (!image || typeof image !== "object") continue;
      const path = (image as Record<string, unknown>).path;
      if (typeof path === "string" && path.trim()) paths.add(path.trim());
    }
  }
  return paths;
}

export function isPublicPrivatePreviewRecord(challenge: Record<string, unknown>) {
  if (challenge.adminReviewRequired === true || ["pending_review", "changes_requested", "rejected"].includes(String(challenge.adminApprovalStatus ?? challenge.reviewStatus ?? ""))) return false;
  const status = String(challenge.status ?? challenge.lifecycleStatus ?? "").toLowerCase();
  return String(challenge.visibility ?? "").toLowerCase() === "private"
    && challenge.publicPreviewEnabled === true
    && challenge.publicVisibility !== false
    && challenge.eventVisibility !== "hidden_until_approved"
    && ["published", "approved", "scheduled", "registration_open", "active", "submission_open", "submission_closed", "voting_open", "voting_closed", "under_review", "winners_announced", "completed"].includes(status);
}
