import { getAdminDb } from "@/lib/firebase/admin";
import { writeAuditLog } from "@/lib/server/audit";
import { requireRequestUser } from "@/lib/server/auth";
import { userOwnsChallenge } from "@/lib/server/challenge-access";
import { fail, serverUnavailable } from "@/lib/server/responses";

const REPORTS = {
  participant: { collection: "challengeParticipants", fields: ["id", "userId", "displayName", "status", "paymentStatus", "submissionStatus", "createdAt"] },
  submission: { collection: "submissions", fields: ["id", "userId", "title", "status", "submittedAt", "reviewedAt"] },
  vote: { collection: "votes", fields: ["id", "userId", "submissionId", "status", "createdAt"] },
  winner: { collection: "winners", fields: ["id", "userId", "submissionId", "placement", "status", "approvedAt"] },
  attendance: { collection: "liveEventRegistrations", fields: ["id", "userId", "status", "checkInStatus", "checkedInAt"] },
  sponsor_interest: { collection: "sponsorProposals", fields: ["id", "sponsorId", "status", "createdAt", "updatedAt"] }
} as const;

function csvCell(value: unknown) { const text = value === null || value === undefined ? "" : String(value); return `"${text.replaceAll('"', '""')}"`; }
export async function GET(request: Request, { params }: { params: Promise<{ challengeId: string }> }) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Host report export");
  const { challengeId } = await params;
  const type = new URL(request.url).searchParams.get("type")?.toLowerCase().replaceAll("-", "_") as keyof typeof REPORTS | undefined;
  if (!type || !REPORTS[type]) return fail("Choose a supported report type.", 400, undefined, "REPORT_TYPE_INVALID");
  const challengeSnap = await db.collection("challenges").doc(challengeId).get();
  if (!challengeSnap.exists) return fail("Challenge not found.", 404, undefined, "NOT_FOUND");
  const challenge = { id: challengeSnap.id, ...challengeSnap.data() } as Record<string, unknown>;
  if (!user.isAdmin && !userOwnsChallenge(challenge, user.uid)) return fail("Only the challenge owner, host, or an admin can export this report.", 403, undefined, "FORBIDDEN");
  const status = String(challenge.status ?? challenge.lifecycleStatus ?? "").toLowerCase();
  if (!["completed", "winners_announced", "settled", "closed"].includes(status)) return fail("Reports are available only for completed challenges.", 409, undefined, "CHALLENGE_NOT_COMPLETED");
  const definition = REPORTS[type];
  const snap = await db.collection(definition.collection).where("challengeId", "==", challengeId).limit(1000).get();
  if (snap.empty) return fail("No data to export.", 404, { reportType: type }, "NO_REPORT_DATA");
  const lines = [definition.fields.join(","), ...snap.docs.map((doc) => { const data = doc.data(); return definition.fields.map((field) => csvCell(field === "id" ? doc.id : data[field])).join(","); })];
  const filename = `${challengeId}-${type}-report.csv`.replace(/[^a-zA-Z0-9_.-]/g, "_");
  await writeAuditLog({ actorId: user.uid, actorType: user.isAdmin ? "admin" : "creator", action: "host.report.export", targetType: "challenge", targetId: challengeId, metadata: { reportType: type, rowCount: snap.size } }, db);
  return new Response(lines.join("\r\n"), { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" } });
}
