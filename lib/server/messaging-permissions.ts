export type MessageAccountType = "user" | "creator" | "host" | "sponsor" | "enterprise" | "admin";

export function canStartConversation(input: { senderType: MessageAccountType; recipientType: MessageAccountType; source: "profile" | "challenge" | "opportunity" | "invite" | "discovery_card" | "existing_conversation" }) {
  const sourceAllowed = input.source !== "existing_conversation";
  const allowed = sourceAllowed && (
    (input.senderType === "sponsor" && ["creator", "host"].includes(input.recipientType))
    || (input.senderType === "host" && ["host", "creator"].includes(input.recipientType))
    || (input.senderType === "creator" && input.recipientType === "creator")
    || input.senderType === "admin"
  );
  return { allowed, manualRecipientIdEntryAllowed: false, fakeDeliveryStateAllowed: false, reason: allowed ? "conversation_context_allowed" : "conversation_start_not_allowed" };
}

export function canReplyToConversation(input: { isParticipant: boolean; anonymous: boolean }) {
  return { allowed: input.isParticipant && !input.anonymous, manualRecipientIdEntryAllowed: false, fakeReadStateAllowed: false };
}
