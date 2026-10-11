export function privateSubmissionInstructionsFromRecord(challenge: Record<string, unknown>): string[] {
  const configured = Array.isArray(challenge.submissionInstructionsList)
    ? challenge.submissionInstructionsList.map((item) => String(item ?? "")).filter((item) => item.trim())
    : [];
  if (configured.length) return configured;
  const legacy = String(challenge.challengeGuidelines ?? "");
  return legacy.trim() ? [legacy] : [""];
}

export function privateSubmissionInstructionPayload(values: string[]) {
  const instructions = values.map((item) => item.trim()).filter(Boolean);
  return {
    submissionInstructionsList: instructions,
    challengeGuidelines: instructions.join("\n"),
  };
}
