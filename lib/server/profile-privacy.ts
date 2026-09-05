export type MessagePrivacyAudience = "general" | "sponsor";

type ProfileRecord = Record<string, unknown>;

export function profilePrivacySettings(profile: ProfileRecord) {
  const value = profile.privacySettings ?? profile.privacy;
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as ProfileRecord
    : {};
}

export function canViewProfileConnections(profile: ProfileRecord, isOwner: boolean) {
  return isOwner || profilePrivacySettings(profile).showFollowersFollowing !== false;
}

export function newConversationPrivacy(profile: ProfileRecord, audience: MessagePrivacyAudience) {
  const privacy = profilePrivacySettings(profile);
  if (audience === "sponsor" && privacy.allowSponsorMessages === false) {
    return {
      allowed: false,
      code: "SPONSOR_MESSAGES_DISABLED",
      message: "This member is not accepting new sponsor messages."
    } as const;
  }
  if (audience === "general" && privacy.allowMessages === false) {
    return {
      allowed: false,
      code: "MESSAGES_DISABLED",
      message: "This member is not accepting new messages."
    } as const;
  }
  return { allowed: true, code: null, message: null } as const;
}
