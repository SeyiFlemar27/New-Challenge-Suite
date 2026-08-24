import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { checkInRewardStreak } from "@/lib/server/reward-economy";
import { fail, ok, serverError, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("Rewards streak");
  try {
    const result = await checkInRewardStreak(db, user.uid);
    return ok(result, result.duplicate ? "You already checked in today." : result.milestonePointsAwarded ? `Streak confirmed. You earned ${result.milestonePointsAwarded} milestone Reward Points.` : "Streak confirmed for today.");
  } catch (error) {
    const code = error instanceof Error ? error.message : "STREAK_CHECK_IN_FAILED";
    if (code === "MEANINGFUL_ACTIVITY_REQUIRED") return fail("Complete an eligible activity today before checking in.", 409, undefined, code);
    if (code === "REWARDS_ACCOUNT_NOT_ELIGIBLE") return fail("This account context is not eligible for consumer Rewards.", 403, undefined, code);
    return serverError("We could not confirm your streak right now.", code);
  }
}
