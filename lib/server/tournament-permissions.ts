import { getUserPlanAccess } from "@/lib/plan-access";

export type TournamentPermissionProfile = Record<string, unknown> & { uid?: string; id?: string; role?: string; accountType?: string };
export type TournamentManagementRole = "host" | "manager" | "participant_manager" | "submission_reviewer" | "moderator" | "judge_coordinator" | "finance_viewer";

function isApprovedEnterprise(profile: TournamentPermissionProfile) {
  const access = getUserPlanAccess(profile);
  return access.isEnterprise && String(profile.enterpriseAccessStatus ?? profile.enterpriseApprovalStatus ?? "").toLowerCase() === "approved";
}

function isAllowedPremiumCreator(profile: TournamentPermissionProfile) {
  const access = getUserPlanAccess(profile);
  return access.isCreator && access.normalizedPlanId !== "free";
}

export function canCreateTournament(profile: TournamentPermissionProfile) {
  const access = getUserPlanAccess(profile);
  const allowed = Boolean(access.isHost || isApprovedEnterprise(profile) || isAllowedPremiumCreator(profile));
  return { allowed, reason: allowed ? "eligible_tournament_host" : access.isSponsor ? "sponsors_cannot_host_or_compete" : "tournament_hosting_requires_host_enterprise_or_allowed_premium_creator" };
}

export function canEditTournament(profile: TournamentPermissionProfile, tournament: Record<string, unknown>) {
  const userId = String(profile.uid ?? profile.id ?? "");
  const owner = String(tournament.hostId ?? tournament.creatorId ?? "");
  const team = Array.isArray(tournament.managementTeam) ? tournament.managementTeam as Array<Record<string, unknown>> : [];
  const member = team.find((item) => String(item.userId ?? "") === userId && String(item.status ?? "active") === "active");
  return { allowed: Boolean(userId && (userId === owner || profile.role === "admin" || profile.isAdmin === true || member)), reason: userId === owner ? "owner" : profile.role === "admin" || profile.isAdmin === true ? "admin" : member ? `role_${String(member.role)}` : "not_tournament_manager" };
}

export function canPublishTournament(profile: TournamentPermissionProfile, tournament: Record<string, unknown>) {
  const create = canCreateTournament(profile);
  const edit = canEditTournament(profile, tournament);
  return { allowed: create.allowed && edit.allowed, reason: !create.allowed ? create.reason : edit.reason };
}

export function canManageTournamentParticipants(profile: TournamentPermissionProfile, tournament: Record<string, unknown>) { return canEditTournament(profile, tournament); }
export function canManageTournamentRounds(profile: TournamentPermissionProfile, tournament: Record<string, unknown>) { return canEditTournament(profile, tournament); }
export function canManageTournamentMatches(profile: TournamentPermissionProfile, tournament: Record<string, unknown>) { return canEditTournament(profile, tournament); }
export function canManageTournamentJudges(profile: TournamentPermissionProfile, tournament: Record<string, unknown>) { return canEditTournament(profile, tournament); }
export function canModerateTournament(profile: TournamentPermissionProfile) { return { allowed: Boolean(profile.role === "admin" || profile.isAdmin === true), reason: "admin_only" }; }
export function canViewTournamentFinance(profile: TournamentPermissionProfile, tournament: Record<string, unknown>) { return canEditTournament(profile, tournament); }
export function canOverrideTournamentResult(profile: TournamentPermissionProfile) { return { allowed: Boolean(profile.role === "admin" || profile.isAdmin === true), reason: "admin_result_override_only" }; }

export function canPerformTournamentRole(profile: TournamentPermissionProfile, tournament: Record<string, unknown>, allowedRoles: TournamentManagementRole[]) {
  const userId = String(profile.uid ?? profile.id ?? "");
  if (profile.role === "admin" || profile.isAdmin === true) return { allowed: true, reason: "admin" };
  if (String(tournament.hostId ?? "") === userId && allowedRoles.includes("host")) return { allowed: true, reason: "host" };
  const team = Array.isArray(tournament.managementTeam) ? tournament.managementTeam as Array<Record<string, unknown>> : [];
  const role = String(team.find((item) => String(item.userId ?? "") === userId && String(item.status ?? "active") === "active")?.role ?? "") as TournamentManagementRole;
  return { allowed: Boolean(role && allowedRoles.includes(role)), reason: role ? `role_${role}` : "role_required" };
}

export function canSponsorCompeteInTournament(profile: TournamentPermissionProfile) {
  const access = getUserPlanAccess(profile);
  return { allowed: !access.isSponsor, reason: access.isSponsor ? "sponsors_cannot_participate_as_competitors" : "participant_eligibility_future_flow" };
}
