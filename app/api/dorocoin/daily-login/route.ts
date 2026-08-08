import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { recordDailyLoginAndStreak } from "@/lib/server/economy-dorocoin";
import { ok, serverUnavailable } from "@/lib/server/responses";

export async function POST(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const db = getAdminDb();
  if (!db) return serverUnavailable("DoroCoin daily reward");
  const profile = await db.collection("profiles").doc(user.uid).get();
  const result = await recordDailyLoginAndStreak(db, { userId: user.uid, timeZone: String(profile.data()?.timeZone ?? profile.data()?.timezone ?? "UTC") });
  return ok(result, result.duplicate ? "Today's DoroCoin login reward was already recorded." : "Daily DoroCoin reward recorded.");
}
