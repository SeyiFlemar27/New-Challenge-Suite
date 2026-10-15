import { NORMAL_FRONTEND_STEPS, getNormalFrontendReadiness, type CreatorBasePrizeFunding } from "@/lib/normal-challenge-frontend";
import type { NormalChallengeReadiness } from "@/lib/normal-challenge-readiness";

export type PrivateBuilderAccess = { privateAccessPolicyVersion: 2; publicPreviewEnabled: boolean; privateAccessMethod: "invite_link" | "invitation_code"; privateJoiningPolicy: "invite_only" | "invite_and_request"; privateVotingAccess: "access_restricted" | "public_voting" };
export const freshPrivateAccess: PrivateBuilderAccess = { privateAccessPolicyVersion: 2, publicPreviewEnabled: false, privateAccessMethod: "invite_link", privateJoiningPolicy: "invite_only", privateVotingAccess: "access_restricted" };
export const PRIVATE_FRONTEND_STEPS = [...NORMAL_FRONTEND_STEPS.slice(0, 5), {
  ...NORMAL_FRONTEND_STEPS[0], key: "access", navLabel: "Access", title: "Access", description: "Choose discovery and one invitation method.", fields: ["privateAccessMethod"], guide: ["Invitations grant access, not participation or a reserved place.", "Only published challenges with open registration can grant new access.", "Your invitation method is locked after publication."]
}, ...NORMAL_FRONTEND_STEPS.slice(5)];
export function privateSharedStep(step: number) { return step > 5 ? step - 1 : step; }
export function privateVisibleStep(step: number) { return step >= 5 ? step + 1 : step; }
export function privateBuilderPayload(access: PrivateBuilderAccess) {
  return { ...access, challengeType: "private", type: "Private Challenge", visibility: "private", privateAccessCode: "", privateAccessCodeMaxUses: null,
    privateVotingAccess: access.publicPreviewEnabled ? access.privateVotingAccess : "access_restricted", privateJoiningPolicy: access.publicPreviewEnabled ? "invite_and_request" : "invite_only" };
}
export function privateBuilderReadiness(payload: Record<string, unknown>, funding: CreatorBasePrizeFunding): NormalChallengeReadiness {
  const shared = getNormalFrontendReadiness(payload, funding);
  const issues = shared.issues.map((item) => ({ ...item, step: privateVisibleStep(item.step) }));
  if (!["invite_link", "invitation_code"].includes(String(payload.privateAccessMethod))) issues.push({ code: "PRIVATE_ACCESS_METHOD_REQUIRED", field: "privateAccessMethod", step: 5, message: "Select Invite Link or Invitation Code." });
  const steps = PRIVATE_FRONTEND_STEPS.map((definition, step) => ({ label: definition.navLabel, issues: issues.filter((item) => item.step === step), complete: !issues.some((item) => definition.key === "review" ? item.step < step : item.step === step) }));
  return { ready: !issues.length, issues, steps, nextRequiredStep: Math.max(0, steps.findIndex((item) => !item.complete)) };
}
