import { sanitizeCustomization } from "@/lib/customization/access";

type ProfileData = Record<string, unknown>;

export function toPublicProfile(userId: string, profile: ProfileData = {}) {
  const displayName = String(profile.displayName ?? profile.name ?? "Challenge Suite Member");
  const customization = sanitizeCustomization(profile.customization as never);
  const role = ["user", "creator", "sponsor"].includes(String(profile.role))
    ? String(profile.role)
    : "user";

  return {
    id: userId,
    uid: userId,
    displayName,
    username: typeof profile.username === "string" ? profile.username : null,
    initials: String(profile.initials ?? displayName.slice(0, 2).toUpperCase()),
    avatarUrl: typeof profile.avatarUrl === "string"
      ? profile.avatarUrl
      : typeof profile.photoURL === "string"
        ? profile.photoURL
        : null,
    bio: typeof profile.bio === "string" ? profile.bio : "",
    role,
    location: typeof profile.location === "string" ? profile.location : null,
    socialLinks: Array.isArray(profile.socialLinks)
      ? profile.socialLinks.filter((value): value is string => typeof value === "string")
      : [],
    customization,
    totalPoints: Number(profile.totalPoints ?? profile.points ?? 0),
    wins: Number(profile.wins ?? profile.winnerCount ?? 0),
    submissionCount: Number(profile.submissionCount ?? 0)
  };
}
