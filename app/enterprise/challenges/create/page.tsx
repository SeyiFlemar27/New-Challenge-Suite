import { EnterpriseCreateEntry } from "@/components/enterprise/enterprise-create-entry";

const supportedTypes = new Set(["normal", "private", "live", "tournament"]);

export default async function EnterpriseCreateChallengePage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const requestedType = String((await searchParams).type ?? "").toLowerCase();
  const selectedType = supportedTypes.has(requestedType) ? requestedType as "normal" | "private" | "live" | "tournament" : null;
  return <EnterpriseCreateEntry selectedType={selectedType} />;
}
