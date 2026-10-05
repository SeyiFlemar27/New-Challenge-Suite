import { fail } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

export async function POST() {
  return fail("Tournament sponsorship proposals have been retired. Start sponsorship from the Sponsor Panel campaign flow.", 410, { redirectTo: "/sponsor/dashboard" }, "TOURNAMENT_SPONSOR_PROPOSALS_RETIRED");
}
