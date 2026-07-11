import { AdminControlCenter } from "@/components/admin/admin-control-center";

const sections = new Set([
  "sponsors", "hosts", "challenges", "submissions", "participants", "winners", "withdrawals", "disputes",
  "users", "creators", "host-workspaces", "sponsor-brands", "events", "tournaments", "dorocoin", "cash-ledger",
  "reports", "audit-logs", "notifications", "support", "announcements", "categories", "voting-rules",
  "revenue-rules", "feature-flags", "roles", "settings", "search", "risk-safety", "media-moderation", "prediction-settlements", "ad-rewards", "enterprise-leads"
  , "predictions", "rewards", "prize-wheel", "kyc"
]);

export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return <AdminControlCenter section={sections.has(section) ? section : "overview"} />;
}
