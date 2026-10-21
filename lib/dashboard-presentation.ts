import { challengeReviewBuilderDestination } from "@/lib/notification-navigation";

export type DashboardRecord = Record<string, unknown> & { id: string };
export function dashboardCount(value: unknown): number | null {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) return null;
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : null;
}
export function dashboardStatus(row: Record<string, unknown>) { return String(row.status ?? row.lifecycleStatus ?? row.managementState ?? 'draft').toLowerCase(); }
export function activeDashboardChallenge(row: Record<string, unknown>) { return !['held','suspended','removed'].includes(String(row.moderationStatus)) && ['active','registration_open','submission_open','voting_open'].includes(dashboardStatus(row)); }
export function confirmedDashboardParticipant(row: Record<string, unknown>) {
  return Boolean(row.participantId) && ['registered','entered','enrolled','approved','active','joined','checked_in','submitted','winner'].includes(String(row.participantStatus)) && !['pending','awaiting_payment','failed','unpaid','refunded'].includes(String(row.paymentStatus));
}
export function dashboardSum(rows: Record<string, unknown>[], key: string): number | null {
  if (!rows.length) return 0;
  const counts = rows.map(row => dashboardCount(row[key]));
  return counts.some(value => value === null) ? null : counts.reduce<number>((sum,value) => sum + (value ?? 0),0);
}
export function dashboardPreviews<T extends DashboardRecord>(rows: T[]) {
  const unique=[...new Map(rows.map(row=>[row.id,row])).values()];
  return unique.sort((a,b)=>Number(activeDashboardChallenge(b))-Number(activeDashboardChallenge(a)) || timestamp(b.updatedAt ?? b.createdAt)-timestamp(a.updatedAt ?? a.createdAt)).slice(0,3);
}
function timestamp(value: unknown) { const time=Date.parse(String(value ?? ''));return Number.isFinite(time)?time:0; }
export function dashboardChallengeAction(row: DashboardRecord) {
  if (['draft','requires_changes','changes_requested','incomplete'].includes(dashboardStatus(row))) return {label:'Continue Setup',href:challengeReviewBuilderDestination(row,row.id,String(row.type ?? '').includes('tournament')?'tournaments':'challenges')};
  return {label:'Manage Challenge',href:`/challenges/${encodeURIComponent(row.id)}/manage`};
}
export function dashboardMoney(value: unknown, currency='USD') {
  const amount=dashboardCount(value);
  return amount===null?'Not available':new Intl.NumberFormat('en-US',{style:'currency',currency}).format(amount/100);
}
