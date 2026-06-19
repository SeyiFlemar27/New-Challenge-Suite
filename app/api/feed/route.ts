import { getAdminDb } from "@/lib/firebase/admin";
import { getChallengeDisplayStatus } from "@/lib/challenge-status";
import { ok, serverError, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return null;
}

function isPublicChallenge(data: FirebaseFirestore.DocumentData) {
  const status = String(data.status ?? "").toLowerCase();
  const type = String(data.type ?? "public").toLowerCase();
  const visibility = String(data.visibility ?? "public").toLowerCase();
  return status !== "draft" && status !== "deleted" && status !== "removed" && type !== "private" && visibility !== "private";
}

function isPublicSubmission(data: FirebaseFirestore.DocumentData) {
  const status = String(data.status ?? "").toLowerCase();
  const visibility = String(data.visibility ?? "public").toLowerCase();
  return ["approved", "published", "winner"].includes(status) && visibility !== "private" && Boolean(data.mediaUrl);
}

export async function GET(request: Request) {
  const db = getAdminDb();
  if (!db) return serverUnavailable("Feed");

  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? 30);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 30;

  try {
    const [challengeSnap, submissionSnap] = await Promise.all([
      db.collection("challenges").orderBy("createdAt", "desc").limit(limit * 2).get(),
      db.collection("submissions").orderBy("createdAt", "desc").limit(limit * 2).get()
    ]);

    const challenges = challengeSnap.docs
      .map((doc) => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          createdAt: toIso(data.createdAt),
          updatedAt: toIso(data.updatedAt),
          startsAt: toIso(data.startsAt) ?? data.startsAt,
          endsAt: toIso(data.endsAt) ?? data.endsAt,
          registrationDeadline: toIso(data.registrationDeadline) ?? data.registrationDeadline,
          computedStatus: getChallengeDisplayStatus(data as any)
        };
      })
      .filter(isPublicChallenge)
      .slice(0, limit);

    const submissions = submissionSnap.docs
      .map((doc) => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          createdAt: toIso(data.createdAt),
          submittedAt: toIso(data.submittedAt),
          updatedAt: toIso(data.updatedAt)
        };
      })
      .filter(isPublicSubmission)
      .slice(0, limit);

    return ok({ challenges, submissions, nextCursor: null }, "Feed loaded.");
  } catch (error) {
    return serverError("Feed could not be loaded.", error instanceof Error ? error.message : error);
  }
}
