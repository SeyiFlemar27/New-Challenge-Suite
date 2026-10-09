import { fail, serverError } from "@/lib/server/responses";
import { requireSponsorContext } from "@/lib/server/sponsor";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { context, response } = await requireSponsorContext(request);
  if (response) return response;
  if (!context) return serverError("Sponsor access could not be verified.");
  return fail("Funding through historical Sponsor proposals is retired. Discover an opportunity to start a new sponsorship relationship.", 410, { redirectTo: "/sponsor/discover" }, "SPONSOR_PROPOSAL_FUNDING_RETIRED");
}
