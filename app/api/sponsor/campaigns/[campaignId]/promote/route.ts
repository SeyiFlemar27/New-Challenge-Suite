import { fail } from "@/lib/server/responses";

export async function POST() {
  return fail("Challenge Credit campaign promotions have been retired.", 410, undefined, "CHALLENGE_CREDITS_RETIRED");
}
