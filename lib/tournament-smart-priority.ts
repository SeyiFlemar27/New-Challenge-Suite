export type TournamentParticipation = { id: string; registrationId: string; title: string; status: string; registrationStatus: string; deadline: string | null; actionable: boolean; completed: boolean; actionLabel: string; href: string; stateLabel: string };

/** Presentation ordering only. The server remains authoritative for every action. */
export function orderTournamentParticipation(items: TournamentParticipation[], now = Date.now()) {
  const actionable = (row: TournamentParticipation) => row.actionable && Boolean(row.deadline && Date.parse(row.deadline) > now);
  return items.slice().sort((a,b) => Number(actionable(b)) - Number(actionable(a))
    || (actionable(a) && actionable(b) ? Date.parse(a.deadline!) - Date.parse(b.deadline!) : 0)
    || Number(a.completed) - Number(b.completed) || a.id.localeCompare(b.id) || a.registrationId.localeCompare(b.registrationId));
}
