import { requireRequestUser } from "@/lib/server/auth";
import { fail, serverError } from "@/lib/server/responses";
import { getAdminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

/** Legacy Sponsor-created proposal endpoint is permanently retired. */
export async function POST(request: Request) {
  const { response } = await requireRequestUser(request);
  if (response) return response;
  if (!getAdminDb()) return serverError("Sponsorships are temporarily unavailable.");
  return fail("Sponsor-created proposals are retired. Discover an opportunity and express interest from the Sponsor workspace.", 410, { redirectTo: "/sponsor/discover" }, "SPONSOR_PROPOSAL_CREATION_RETIRED");
}
