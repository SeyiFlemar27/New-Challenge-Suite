import { fail } from "@/lib/server/responses";

export async function GET() {
  return fail("Challenge Credit packages are retired. Use DoroCoin in supported product flows.", 410, { redirectTo: "/dorocoins" }, "CHALLENGE_CREDITS_RETIRED");
}
