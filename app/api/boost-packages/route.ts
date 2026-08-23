import { fail } from "@/lib/server/responses";

export async function GET() {
  return fail("Monthly Boost is managed from an eligible challenge's Overview.", 410, undefined, "BOOST_PACKAGES_RETIRED");
}
