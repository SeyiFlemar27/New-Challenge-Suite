import { fail } from "@/lib/server/responses";

export async function POST() {
  return fail("Challenge Credit purchases have been retired. Use DoroCoin in supported product flows.", 410, { redirectTo: "/dorocoins" }, "CHALLENGE_CREDITS_RETIRED");
}
