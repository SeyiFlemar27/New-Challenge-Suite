import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { ok, serverError, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

/** Records only self-service setup intent. Never grants Sponsor approval or operational access. */
export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Sponsor setup");
  try {
    await db.runTransaction(async (transaction) => {
      const refs = [db.collection("users").doc(user.uid), db.collection("profiles").doc(user.uid)];
      const snapshots = await transaction.getAll(...refs);
      const existing = { ...snapshots[1].data(), ...snapshots[0].data() };
      if (existing.sponsorOnboardingStatus != null || existing.sponsorOnboardingComplete === true || existing.sponsorOrganizationId) return;
      for (const ref of refs) transaction.set(ref, { sponsorOnboardingStatus: "not_started" }, { merge: true });
    });
    return ok({ destination: "/sponsor/onboarding" }, "Sponsor setup is ready.");
  } catch {
    return serverError("Sponsor setup could not be started. Please try again.");
  }
}
