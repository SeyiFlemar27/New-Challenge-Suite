import { getAdminDb } from "@/lib/firebase/admin";
import { ok } from "@/lib/server/responses";
import { getActiveEconomyRules } from "@/lib/server/economy-rules";

export async function GET() {
  const rules = await getActiveEconomyRules(getAdminDb());
  return ok({ packages: rules.challengeCredits.packages, creditsPerUsd: rules.challengeCredits.creditsPerUsd, ruleVersion: rules.version, withdrawable: false }, "Challenge Credit packages loaded.");
}
