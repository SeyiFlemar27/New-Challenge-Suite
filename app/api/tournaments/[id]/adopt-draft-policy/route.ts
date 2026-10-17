import { requireRequestUser } from "@/lib/server/auth";
import { getAdminDb } from "@/lib/firebase/admin";
import { fail, ok, readJson, serverUnavailable } from "@/lib/server/responses";
import { adoptTournamentDraftPolicy } from "@/lib/server/tournament-draft-adoption";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Tournament draft conversion");
  const parsed = await readJson(request);
  if (parsed.response) return parsed.response;
  if (parsed.body?.confirmed !== true || (parsed.body.expectedUpdatedAt !== null && typeof parsed.body.expectedUpdatedAt !== "string")) return fail("Confirm the current Tournament rules and reload the draft before conversion.", 400, undefined, "DRAFT_POLICY_CONFIRMATION_REQUIRED");
  try {
    const result = await adoptTournamentDraftPolicy(db, { tournamentId: (await context.params).id, actor: { uid: user.uid, role: user.role, isAdmin: user.isAdmin }, confirmed: true, expectedUpdatedAt: parsed.body.expectedUpdatedAt });
    return ok(result, "Unused draft converted. Review every section before submitting; no competition or financial operation was executed.");
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String(error.code) : "DRAFT_POLICY_REVIEW_REQUIRED";
    if (code === "TOURNAMENT_NOT_FOUND") return fail("Tournament not found.", 404, undefined, code);
    if (["DRAFT_POLICY_OWNER_REQUIRED", "TOURNAMENT_HOSTING_LOCKED"].includes(code)) return fail("The responsible owner with current Tournament creation access must perform conversion.", 403, undefined, code);
    return fail("This draft changed or has existing activity or financial commitments. Its saved terms remain unchanged; contact Support for review.", 409, undefined, code);
  }
}
