export type NotificationNavigationInput = {
  type?: unknown;
  entityType?: unknown;
  entityId?: unknown;
  targetId?: unknown;
  actionUrl?: unknown;
  metadata?: unknown;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeId(value: unknown) {
  const valueText = text(value);
  return /^[a-zA-Z0-9_.:-]+$/.test(valueText) ? valueText : "";
}

export function safeNotificationActionUrl(value: unknown) {
  const path = text(value);
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") ? path.slice(0, 500) : null;
}

export function notificationDestination(input: NotificationNavigationInput) {
  const explicit = safeNotificationActionUrl(input.actionUrl);
  if (explicit) return explicit;

  const type = text(input.type).toLowerCase();
  const entityType = text(input.entityType).toLowerCase();
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata as Record<string, unknown> : {};
  const challengeId = safeId(metadata.challengeId) || (entityType === "challenge" ? safeId(input.entityId) : "") || (/challenge|entry_request/.test(type) ? safeId(input.targetId) : "");
  const requestId = safeId(metadata.requestId) || safeId(metadata.entryRequestId) || (entityType === "entry_request" ? safeId(input.entityId) : "");
  const submissionId = safeId(metadata.submissionId) || (entityType === "submission" ? safeId(input.entityId) : "") || (type.includes("submission") ? safeId(input.targetId) : "");
  const proposalId = safeId(metadata.proposalId) || (entityType === "winner_proposal" ? safeId(input.entityId) : "");
  const sponsorProposalId = safeId(metadata.sponsorProposalId) || (entityType === "sponsor_proposal" ? safeId(input.entityId) : "") || (type.includes("sponsor") ? safeId(input.targetId) : "");

  if (type.includes("entry_request") && challengeId) {
    const focus = requestId ? `&focus=${encodeURIComponent(requestId)}` : "";
    return `/challenges/${encodeURIComponent(challengeId)}/manage?tab=participant-requests${focus}`;
  }
  if (type.includes("winner") && challengeId) {
    const focus = proposalId ? `&focus=${encodeURIComponent(proposalId)}` : "";
    return `/challenges/${encodeURIComponent(challengeId)}/manage?tab=winners${focus}`;
  }
  if (submissionId) return `/submissions/${encodeURIComponent(submissionId)}`;
  if (sponsorProposalId) return `/sponsor/proposals/${encodeURIComponent(sponsorProposalId)}`;
  if (type.includes("payment") || type.includes("refund") || type.includes("settlement") || type.includes("wallet")) return "/wallet";
  if (challengeId) return `/challenges/${encodeURIComponent(challengeId)}`;
  return "/notifications/unavailable";
}
