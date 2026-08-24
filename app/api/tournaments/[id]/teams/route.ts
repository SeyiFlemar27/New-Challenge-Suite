import { createHash } from "node:crypto";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { conflict, fail, ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";
import type { TournamentFoundation, TournamentTeamFoundation } from "@/lib/tournament-types";

export const dynamic = "force-dynamic";
const normalizedName = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const teamId = (tournamentId: string, name: string) => `${tournamentId}_${createHash("sha256").update(name).digest("hex").slice(0, 20)}`;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament teams");
  const { id } = await context.params;
  const url = new URL(request.url);
  const search = String(url.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 60);
  const searchTeamId = String(url.searchParams.get("teamId") ?? "");
  if (search) {
    if (search.length < 2 || !searchTeamId) return validationError({ q: "Enter at least two characters." });
    const searchTeam = await db.collection("tournamentTeams").doc(searchTeamId).get();
    if (!searchTeam.exists || searchTeam.data()?.tournamentId !== id || searchTeam.data()?.captainUserId !== user.uid) return fail("Only the Team Captain can search for members.", 403, undefined, "TEAM_CAPTAIN_REQUIRED");
    if (searchTeam.data()?.rosterLockedAt) return conflict("This Team roster is locked.");
    const profiles = await db.collection("users").limit(250).get();
    const members = profiles.docs.map((profile) => {
      const data = profile.data();
      return { id: profile.id, displayName: String(data.displayName ?? data.name ?? data.username ?? "Account"), username: String(data.username ?? "") };
    }).filter((profile) => profile.id !== user.uid && `${profile.displayName} ${profile.username}`.toLowerCase().includes(search)).slice(0, 12);
    return ok({ members }, "Eligible account results loaded.");
  }
  const [snap, membershipSnap, invitationsSnap, requestsSnap, transfersSnap] = await Promise.all([
    db.collection("tournamentTeams").where("tournamentId", "==", id).limit(150).get(),
    db.collection("tournamentTeamMemberships").doc(`${id}_${user.uid}`).get(),
    db.collection("tournamentTeamInvitations").where("tournamentId", "==", id).limit(300).get(),
    db.collection("tournamentTeamRequests").where("tournamentId", "==", id).limit(300).get(),
    db.collection("tournamentCaptainTransfers").where("tournamentId", "==", id).limit(100).get()
  ]);
  const records = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as TournamentTeamFoundation));
  const viewerTeamId = String(membershipSnap.data()?.teamId ?? "");
  const viewerTeam = records.find((team) => team.id === viewerTeamId) ?? null;
  const captainTeamIds = new Set(records.filter((team) => team.captainUserId === user.uid).map((team) => team.id));
  const visibleInvitations = invitationsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as {
    id: string;
    inviteeUserId?: string;
    teamId?: string;
    status?: string;
  })).filter((invite) => invite.inviteeUserId === user.uid || captainTeamIds.has(String(invite.teamId ?? "")));
  const visibleRequests = requestsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as {
    id: string;
    userId?: string;
    teamId?: string;
    status?: string;
  })).filter((joinRequest) => joinRequest.userId === user.uid || captainTeamIds.has(String(joinRequest.teamId ?? "")));
  const visibleTransfers = transfersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as {
    id: string;
    teamId?: string;
    fromUserId?: string;
    toUserId?: string;
    status?: string;
  })).filter((transfer) => transfer.fromUserId === user.uid || transfer.toUserId === user.uid);
  const identityIds = new Set<string>();
  if (viewerTeam) viewerTeam.memberUserIds.forEach((memberId) => identityIds.add(memberId));
  visibleInvitations.forEach((invite) => identityIds.add(String(invite.inviteeUserId ?? "")));
  visibleRequests.forEach((joinRequest) => identityIds.add(String(joinRequest.userId ?? "")));
  visibleTransfers.forEach((transfer) => {
    identityIds.add(String(transfer.fromUserId ?? ""));
    identityIds.add(String(transfer.toUserId ?? ""));
  });
  const profileSnaps = await Promise.all([...identityIds].filter(Boolean).slice(0, 100).map((profileId) => db.collection("users").doc(profileId).get()));
  const identities = Object.fromEntries(profileSnaps.map((profile) => {
    const data = profile.data() ?? {};
    return [profile.id, { id: profile.id, displayName: String(data.displayName ?? data.name ?? data.username ?? "Tournament member"), username: String(data.username ?? "") }];
  }));
  const teams = records.map((team) => ({ id: team.id, tournamentId: team.tournamentId, name: team.name, status: team.status, paymentStatus: team.paymentStatus, seed: team.seed, rankingScore: team.rankingScore, rosterLockedAt: team.rosterLockedAt, memberCount: team.memberUserIds.length, canManage: team.captainUserId === user.uid, isViewerTeam: team.id === viewerTeamId }));
  return ok({ teams, viewerTeam, viewerCanManage: viewerTeam?.captainUserId === user.uid, invitations: visibleInvitations, requests: visibleRequests, captainTransfers: visibleTransfers, identities }, "Tournament teams loaded.");
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament team operation");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body as Record<string, unknown> : {};
  const action = String(body.action ?? "create");
  const { id } = await context.params;
  const tournamentRef = db.collection("tournaments").doc(id);
  const tournamentSnap = await tournamentRef.get();
  if (!tournamentSnap.exists) return fail("Tournament not found.", 404, undefined, "TOURNAMENT_NOT_FOUND");
  const tournament = { id, ...tournamentSnap.data() } as TournamentFoundation;
  if (tournament.participationMode !== "team") return fail("This tournament uses individual participation.", 409, undefined, "TOURNAMENT_TEAM_MODE_REQUIRED");
  if (!["registration_open", "scheduled"].includes(tournament.status)) return fail("Team rosters can only change before registration closes.", 409, undefined, "TOURNAMENT_ROSTER_CHANGES_CLOSED");
  const now = new Date().toISOString();
  const membershipRef = db.collection("tournamentTeamMemberships").doc(`${id}_${user.uid}`);

  if (action === "create") {
    const name = String(body.name ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
    const canonicalName = normalizedName(name);
    if (name.length < 2) return validationError({ name: "Enter a team name." });
    const ref = db.collection("tournamentTeams").doc(teamId(id, canonicalName));
    try {
      await db.runTransaction(async (transaction) => {
        const [existingTeam, existingMembership, currentTournament] = await Promise.all([transaction.get(ref), transaction.get(membershipRef), transaction.get(tournamentRef)]);
        if (existingTeam.exists) throw new Error("TEAM_NAME_EXISTS");
        if (existingMembership.exists) throw new Error("ALREADY_ON_TEAM");
        if (!["registration_open", "scheduled"].includes(String(currentTournament.data()?.status ?? ""))) throw new Error("ROSTER_CLOSED");
        const team: TournamentTeamFoundation & { nameNormalized: string } = { id: ref.id, tournamentId: id, name, nameNormalized: canonicalName, captainUserId: user.uid, memberUserIds: [user.uid], status: "forming", paymentStatus: tournament.entryType === "free" ? "not_required" : "pending", seed: null, rankingScore: null, rosterLockedAt: null, createdAt: now, updatedAt: now };
        transaction.create(ref, team);
        transaction.create(membershipRef, { id: membershipRef.id, tournamentId: id, teamId: ref.id, userId: user.uid, role: "captain", status: "active", createdAt: now, updatedAt: now });
        transaction.create(db.collection("tournamentAuditEvents").doc(`${ref.id}_created`), { id: `${ref.id}_created`, tournamentId: id, actorId: user.uid, action: "team_created", createdAt: now, metadata: { teamId: ref.id } });
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "TEAM_NAME_EXISTS") return conflict("That team name is already used in this tournament.");
      if (code === "ALREADY_ON_TEAM") return conflict("You can belong to only one team in this tournament.");
      if (code === "ROSTER_CLOSED") return conflict("Tournament roster changes are closed.");
      throw error;
    }
    return ok({ teamId: ref.id }, "Tournament team created.");
  }

  const targetTeamId = String(body.teamId ?? "");
  if (!targetTeamId) return validationError({ teamId: "Select a tournament team." });
  const teamRef = db.collection("tournamentTeams").doc(targetTeamId);
  if (action === "request_join") {
    if (tournament.teamConfig?.joiningMode !== "invite_and_requests") return fail("This team does not accept join requests.", 403, undefined, "TEAM_REQUESTS_DISABLED");
    if ((await membershipRef.get()).exists) return conflict("You can belong to only one team in this tournament.");
    const requestedTeam = await teamRef.get();
    if (!requestedTeam.exists) return fail("Tournament team not found.", 404, undefined, "TOURNAMENT_TEAM_NOT_FOUND");
    const requestedTeamData = requestedTeam.data() as TournamentTeamFoundation;
    if (requestedTeamData.rosterLockedAt) return conflict("This team roster is locked.");
    if (requestedTeamData.memberUserIds.length >= Number(tournament.teamConfig?.maximumSize ?? 20)) return conflict("This team is full.");
    const requestRef = db.collection("tournamentTeamRequests").doc(`${targetTeamId}_${user.uid}`);
    try {
      await requestRef.create({ id: requestRef.id, tournamentId: id, teamId: targetTeamId, userId: user.uid, status: "pending", createdAt: now, updatedAt: now });
    } catch {
      return conflict("A team join request already exists.");
    }
    return ok({ requestId: requestRef.id }, "Team join request sent.");
  }

  const teamSnap = await teamRef.get();
  if (!teamSnap.exists) return fail("Tournament team not found.", 404, undefined, "TOURNAMENT_TEAM_NOT_FOUND");
  const team = { id: teamSnap.id, ...teamSnap.data() } as TournamentTeamFoundation;

  if (action === "confirm_captain_transfer") {
    const transferRef = db.collection("tournamentCaptainTransfers").doc(`${targetTeamId}_${user.uid}`);
    const nextMembershipRef = db.collection("tournamentTeamMemberships").doc(`${id}_${user.uid}`);
    try {
      await db.runTransaction(async (transaction) => {
        const [currentTeamSnap, transferSnap, currentCaptainMembership, nextCaptainMembership] = await Promise.all([
          transaction.get(teamRef),
          transaction.get(transferRef),
          transaction.get(db.collection("tournamentTeamMemberships").doc(`${id}_${team.captainUserId}`)),
          transaction.get(nextMembershipRef)
        ]);
        const currentTeam = currentTeamSnap.data() as TournamentTeamFoundation;
        const transfer = transferSnap.data();
        if (!currentTeamSnap.exists || currentTeam.rosterLockedAt || !transferSnap.exists || transfer?.status !== "pending" || transfer?.fromUserId !== currentTeam.captainUserId || transfer?.toUserId !== user.uid || !currentCaptainMembership.exists || !nextCaptainMembership.exists) throw new Error("CAPTAIN_TRANSFER_STATE_CHANGED");
        transaction.set(teamRef, { captainUserId: user.uid, updatedAt: now }, { merge: true });
        transaction.set(currentCaptainMembership.ref, { role: "member", updatedAt: now }, { merge: true });
        transaction.set(nextMembershipRef, { role: "captain", updatedAt: now }, { merge: true });
        transaction.set(transferRef, { status: "accepted", acceptedAt: now, updatedAt: now }, { merge: true });
        transaction.create(db.collection("tournamentAuditEvents").doc(`${targetTeamId}_captain_transfer_accepted_${user.uid}`), { id: `${targetTeamId}_captain_transfer_accepted_${user.uid}`, tournamentId: id, actorId: user.uid, action: "team_captain_transfer_accepted", createdAt: now, metadata: { teamId: targetTeamId, previousCaptainId: currentTeam.captainUserId, nextCaptainId: user.uid } });
      });
    } catch (error) {
      if (error instanceof Error && error.message === "CAPTAIN_TRANSFER_STATE_CHANGED") return conflict("This Captain transfer can no longer be accepted.");
      throw error;
    }
    return ok({ teamId: targetTeamId, captainUserId: user.uid }, "You are now the Team Captain.");
  }

  if (action === "accept_invite") {
    const invitationRef = db.collection("tournamentTeamInvitations").doc(`${targetTeamId}_${user.uid}`);
    try {
      await db.runTransaction(async (transaction) => {
        const [currentTeamSnap, invitationSnap, currentMembership] = await Promise.all([transaction.get(teamRef), transaction.get(invitationRef), transaction.get(membershipRef)]);
        const currentTeam = currentTeamSnap.data() as TournamentTeamFoundation;
        if (!invitationSnap.exists || invitationSnap.data()?.status !== "pending") throw new Error("INVITATION_NOT_PENDING");
        if (invitationSnap.data()?.expiresAt && new Date(String(invitationSnap.data()?.expiresAt)).getTime() <= Date.now()) throw new Error("INVITATION_EXPIRED");
        if (currentMembership.exists) throw new Error("ALREADY_ON_TEAM");
        if (currentTeam.rosterLockedAt) throw new Error("ROSTER_LOCKED");
        if (currentTeam.memberUserIds.length >= Number(tournament.teamConfig?.maximumSize ?? 20)) throw new Error("TEAM_FULL");
        transaction.set(teamRef, { memberUserIds: [...currentTeam.memberUserIds, user.uid], updatedAt: now }, { merge: true });
        transaction.create(membershipRef, { id: membershipRef.id, tournamentId: id, teamId: targetTeamId, userId: user.uid, role: "member", status: "active", createdAt: now, updatedAt: now });
        transaction.set(invitationRef, { status: "accepted", acceptedAt: now, updatedAt: now }, { merge: true });
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (["INVITATION_NOT_PENDING", "INVITATION_EXPIRED", "ALREADY_ON_TEAM", "ROSTER_LOCKED", "TEAM_FULL"].includes(code)) return conflict(code === "INVITATION_EXPIRED" ? "This team invitation has expired." : code === "TEAM_FULL" ? "This team is full." : "This team invitation can no longer be accepted.");
      throw error;
    }
    return ok({ teamId: targetTeamId }, "Team invitation accepted.");
  }

  if (action === "leave") {
    if (!team.memberUserIds.includes(user.uid)) return fail("You are not an active member of this team.", 403, undefined, "TEAM_MEMBERSHIP_REQUIRED");
    if (team.rosterLockedAt) return conflict("This team roster is locked.");
    if (team.captainUserId === user.uid) return conflict("Transfer the Captain role or disband the team before leaving.");
    try {
      await db.runTransaction(async (transaction) => {
        const [currentTeamSnap, currentMembership] = await Promise.all([transaction.get(teamRef), transaction.get(membershipRef)]);
        const currentTeam = currentTeamSnap.data() as TournamentTeamFoundation;
        if (!currentMembership.exists || currentTeam.rosterLockedAt) throw new Error("ROSTER_CHANGED");
        transaction.set(teamRef, { memberUserIds: currentTeam.memberUserIds.filter((memberId) => memberId !== user.uid), status: "forming", updatedAt: now }, { merge: true });
        transaction.delete(membershipRef);
      });
    } catch (error) {
      if (error instanceof Error && error.message === "ROSTER_CHANGED") return conflict("This team roster changed. Refresh and try again.");
      throw error;
    }
    return ok({ teamId: targetTeamId }, "You left the tournament team.");
  }

  if (team.captainUserId !== user.uid) return fail("Only the Team Captain can manage this roster.", 403, undefined, "TEAM_CAPTAIN_REQUIRED");
  if (team.rosterLockedAt) return conflict("This team roster is locked.");

  if (action === "invite") {
    const invitedUserId = String(body.userId ?? "");
    if (!invitedUserId || invitedUserId === user.uid) return validationError({ userId: "Choose another user to invite." });
    const invitedMembershipRef = db.collection("tournamentTeamMemberships").doc(`${id}_${invitedUserId}`);
    if ((await invitedMembershipRef.get()).exists) return conflict("This user already belongs to a team in the tournament.");
    if (team.memberUserIds.length >= Number(tournament.teamConfig?.maximumSize ?? 20)) return conflict("This team is full.");
    const invitationRef = db.collection("tournamentTeamInvitations").doc(`${targetTeamId}_${invitedUserId}`);
    try {
      await invitationRef.create({ id: invitationRef.id, tournamentId: id, teamId: targetTeamId, inviteeUserId: invitedUserId, invitedBy: user.uid, status: "pending", expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), createdAt: now, updatedAt: now });
    } catch {
      return conflict("An active invitation already exists for this user.");
    }
    return ok({ invitationId: invitationRef.id }, "Team invitation sent.");
  }

  if (action === "accept_request") {
    const requestedUserId = String(body.userId ?? "");
    const requestRef = db.collection("tournamentTeamRequests").doc(`${targetTeamId}_${requestedUserId}`);
    const targetMembershipRef = db.collection("tournamentTeamMemberships").doc(`${id}_${requestedUserId}`);
    try {
      await db.runTransaction(async (transaction) => {
        const [currentTeamSnap, requestSnap, membershipSnap] = await Promise.all([transaction.get(teamRef), transaction.get(requestRef), transaction.get(targetMembershipRef)]);
        const currentTeam = currentTeamSnap.data() as TournamentTeamFoundation;
        if (!currentTeamSnap.exists || currentTeam.rosterLockedAt) throw new Error("ROSTER_LOCKED");
        if (!requestSnap.exists || requestSnap.data()?.status !== "pending") throw new Error("REQUEST_NOT_PENDING");
        if (membershipSnap.exists) throw new Error("ALREADY_ON_TEAM");
        if (currentTeam.memberUserIds.length >= Number(tournament.teamConfig?.maximumSize ?? 20)) throw new Error("TEAM_FULL");
        transaction.set(teamRef, { memberUserIds: [...currentTeam.memberUserIds, requestedUserId], updatedAt: now }, { merge: true });
        transaction.create(targetMembershipRef, { id: targetMembershipRef.id, tournamentId: id, teamId: targetTeamId, userId: requestedUserId, role: "member", status: "active", createdAt: now, updatedAt: now });
        transaction.set(requestRef, { status: "accepted", decidedAt: now, decidedBy: user.uid, updatedAt: now }, { merge: true });
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (["REQUEST_NOT_PENDING", "ALREADY_ON_TEAM", "TEAM_FULL", "ROSTER_LOCKED"].includes(code)) return conflict(code === "TEAM_FULL" ? "This team is full." : code === "ROSTER_LOCKED" ? "This team roster is locked." : "This join request can no longer be accepted.");
      throw error;
    }
    return ok({ teamId: targetTeamId, userId: requestedUserId }, "Team join request accepted.");
  }

  if (action === "reject_request") {
    const requestedUserId = String(body.userId ?? "");
    const requestRef = db.collection("tournamentTeamRequests").doc(`${targetTeamId}_${requestedUserId}`);
    const requestSnap = await requestRef.get();
    if (!requestSnap.exists || requestSnap.data()?.status !== "pending") return conflict("This join request can no longer be rejected.");
    await requestRef.set({ status: "rejected", decidedAt: now, decidedBy: user.uid, updatedAt: now }, { merge: true });
    return ok({ requestId: requestRef.id }, "Team join request rejected.");
  }

  if (action === "revoke_invite") {
    const invitedUserId = String(body.userId ?? "");
    const invitationRef = db.collection("tournamentTeamInvitations").doc(`${targetTeamId}_${invitedUserId}`);
    const invitationSnap = await invitationRef.get();
    if (!invitationSnap.exists || invitationSnap.data()?.status !== "pending") return conflict("This invitation can no longer be revoked.");
    await invitationRef.set({ status: "revoked", revokedAt: now, revokedBy: user.uid, updatedAt: now }, { merge: true });
    return ok({ invitationId: invitationRef.id }, "Team invitation revoked.");
  }

  if (action === "remove_member") {
    const removedUserId = String(body.userId ?? "");
    if (!removedUserId || removedUserId === user.uid || !team.memberUserIds.includes(removedUserId)) return validationError({ userId: "Choose an active Team member." });
    const removedMembershipRef = db.collection("tournamentTeamMemberships").doc(`${id}_${removedUserId}`);
    await db.runTransaction(async (transaction) => {
      const currentTeamSnap = await transaction.get(teamRef);
      const currentTeam = currentTeamSnap.data() as TournamentTeamFoundation;
      if (!currentTeamSnap.exists || currentTeam.captainUserId !== user.uid || currentTeam.rosterLockedAt || !currentTeam.memberUserIds.includes(removedUserId)) throw new Error("ROSTER_CHANGED");
      transaction.set(teamRef, { memberUserIds: currentTeam.memberUserIds.filter((memberId) => memberId !== removedUserId), status: "forming", updatedAt: now }, { merge: true });
      transaction.delete(removedMembershipRef);
      transaction.create(db.collection("tournamentAuditEvents").doc(`${targetTeamId}_member_removed_${removedUserId}`), { id: `${targetTeamId}_member_removed_${removedUserId}`, tournamentId: id, actorId: user.uid, action: "team_member_removed", createdAt: now, metadata: { teamId: targetTeamId, removedUserId } });
    });
    return ok({ teamId: targetTeamId, userId: removedUserId }, "Team member removed.");
  }

  if (action === "transfer_captain") {
    const nextCaptainId = String(body.userId ?? "");
    if (!team.memberUserIds.includes(nextCaptainId) || nextCaptainId === user.uid) return validationError({ userId: "Choose another active team member." });
    const transferRef = db.collection("tournamentCaptainTransfers").doc(`${targetTeamId}_${nextCaptainId}`);
    try {
      await db.runTransaction(async (transaction) => {
        const [currentTeamSnap, nextCaptainMembership, existingTransfer] = await Promise.all([transaction.get(teamRef), transaction.get(db.collection("tournamentTeamMemberships").doc(`${id}_${nextCaptainId}`)), transaction.get(transferRef)]);
        const currentTeam = currentTeamSnap.data() as TournamentTeamFoundation;
        if (!currentTeamSnap.exists || currentTeam.captainUserId !== user.uid || currentTeam.rosterLockedAt || !currentTeam.memberUserIds.includes(nextCaptainId) || !nextCaptainMembership.exists || (existingTransfer.exists && existingTransfer.data()?.status === "pending")) throw new Error("CAPTAIN_TRANSFER_STATE_CHANGED");
        transaction.set(transferRef, { id: transferRef.id, tournamentId: id, teamId: targetTeamId, fromUserId: user.uid, toUserId: nextCaptainId, status: "pending", requestedAt: now, createdAt: now, updatedAt: now });
        transaction.create(db.collection("tournamentAuditEvents").doc(`${targetTeamId}_captain_transfer_requested_${nextCaptainId}`), { id: `${targetTeamId}_captain_transfer_requested_${nextCaptainId}`, tournamentId: id, actorId: user.uid, action: "team_captain_transfer_requested", createdAt: now, metadata: { teamId: targetTeamId, nextCaptainId } });
      });
    } catch (error) {
      if (error instanceof Error && error.message === "CAPTAIN_TRANSFER_STATE_CHANGED") return conflict("The Team roster changed. Refresh and try again.");
      throw error;
    }
    return ok({ teamId: targetTeamId, proposedCaptainUserId: nextCaptainId }, "Captain transfer sent for confirmation.");
  }

  if (action === "disband") {
    const memberSnaps = await db.collection("tournamentTeamMemberships").where("teamId", "==", targetTeamId).get();
    try {
      await db.runTransaction(async (transaction) => {
        const currentTeamSnap = await transaction.get(teamRef);
        const currentTeam = currentTeamSnap.data() as TournamentTeamFoundation;
        if (!currentTeamSnap.exists || currentTeam.captainUserId !== user.uid || currentTeam.rosterLockedAt) throw new Error("TEAM_CANNOT_DISBAND");
        transaction.delete(teamRef);
        memberSnaps.docs.forEach((memberSnap) => transaction.delete(memberSnap.ref));
        transaction.create(db.collection("tournamentAuditEvents").doc(`${targetTeamId}_disbanded`), { id: `${targetTeamId}_disbanded`, tournamentId: id, actorId: user.uid, action: "team_disbanded", createdAt: now, metadata: { teamId: targetTeamId } });
      });
    } catch (error) {
      if (error instanceof Error && error.message === "TEAM_CANNOT_DISBAND") return conflict("This team can no longer be disbanded.");
      throw error;
    }
    return ok({ teamId: targetTeamId }, "Tournament team disbanded.");
  }

  if (action === "ready") {
    const minimum = Number(tournament.teamConfig?.minimumSize ?? 1);
    if (team.memberUserIds.length < minimum) return fail(`Add at least ${minimum} team members before marking the team ready.`, 422, undefined, "TEAM_MINIMUM_NOT_MET");
    const paymentSnap = await db.collection("tournamentEntryPayments").doc(`${id}_${user.uid}`).get();
    if (tournament.entryType !== "free" && !(paymentSnap.exists && paymentSnap.data()?.status === "confirmed" && paymentSnap.data()?.webhookConfirmed === true)) return fail("Confirmed Captain payment is required before the team can become ready.", 422, undefined, "TEAM_PAYMENT_CONFIRMATION_REQUIRED");
    await teamRef.set({ status: "ready", paymentStatus: tournament.entryType === "free" ? "not_required" : "confirmed", readyAt: now, updatedAt: now }, { merge: true });
    return ok({ teamId: targetTeamId, status: "ready" }, "Team is ready for tournament check-in.");
  }

  return validationError({ action: "Select a valid team action." });
}
