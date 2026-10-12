export type OfficialWinnerRecord = Record<string, unknown> & {
  challengeId?: unknown;
  userId?: unknown;
  submissionId?: unknown;
  position?: unknown;
  status?: unknown;
};

export function validateAuthoritativeWinnerRecords(
  challengeId: string,
  winners: OfficialWinnerRecord[],
  expectedCount?: number
) {
  const errors: string[] = [];
  if (!challengeId) errors.push("challenge_id_required");
  if (!Array.isArray(winners) || winners.length === 0) errors.push("winner_records_required");
  if (Number.isSafeInteger(expectedCount) && expectedCount! > 0 && winners.length !== expectedCount) errors.push("winner_count_mismatch");
  const users = new Set<string>();
  const submissions = new Set<string>();
  const positions = new Set<number>();
  for (const winner of winners) {
    const winnerChallengeId = String(winner.challengeId ?? "");
    const userId = String(winner.userId ?? "");
    const submissionId = String(winner.submissionId ?? "");
    const position = Number(winner.position ?? winner.rank);
    const status = String(winner.status ?? "").toLowerCase();
    if (winnerChallengeId !== challengeId) errors.push("winner_challenge_mismatch");
    if (!userId) errors.push("winner_user_required");
    if (!submissionId) errors.push("winner_submission_required");
    if (!Number.isSafeInteger(position) || position < 1) errors.push("winner_position_invalid");
    if (!new Set(["approved", "pending_announcement", "announced", "paid"]).has(status)) errors.push("winner_status_invalid");
    if (userId && users.has(userId)) errors.push("duplicate_winner_user");
    if (submissionId && submissions.has(submissionId)) errors.push("duplicate_winner_submission");
    if (Number.isSafeInteger(position) && positions.has(position)) errors.push("duplicate_winner_position");
    if (userId) users.add(userId);
    if (submissionId) submissions.add(submissionId);
    if (Number.isSafeInteger(position)) positions.add(position);
  }
  return { valid: errors.length === 0, errors, winnerCount: winners.length };
}

export function isValidatedWinnerAnnouncement(challenge: Record<string, unknown>) {
  const ids = Array.isArray(challenge.officialWinnerRecordIds) ? challenge.officialWinnerRecordIds : [];
  const count = Number(challenge.officialWinnerRecordCount ?? 0);
  return Boolean(challenge.officialWinnerRecordsValidatedAt)
    && ids.length > 0
    && Number.isSafeInteger(count)
    && count === ids.length;
}
