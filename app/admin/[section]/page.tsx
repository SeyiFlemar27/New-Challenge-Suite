import { AdminControlCenter } from "@/components/admin/admin-control-center";
import { ChallengeReviewCenter } from "@/components/admin/challenge-review-center";

const sections = new Set([
  "action-centre", "sponsors", "hosts", "challenges", "submissions", "participants", "winners", "withdrawals", "disputes",
  "users", "creators", "host-workspaces", "sponsor-brands", "events", "tournaments", "dorocoin", "cash-ledger",
  "reports", "audit-logs", "notifications", "support", "announcements", "categories", "voting-rules",
  "revenue-rules", "feature-flags", "roles", "settings", "search", "risk-safety", "media-moderation", "prediction-settlements", "ad-rewards", "enterprise-applications", "enterprise-leads", "contact-requests"
  , "predictions", "rewards", "prize-wheel", "kyc", "settlements", "refunds", "appeals", "sponsor-campaigns", "system-status"
]);

export default async function AdminSectionPage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams?: Promise<{ view?: string }> }) {
  const { section } = await params;
  const view = (await searchParams)?.view;
  if ((section === "challenges" || section === "tournaments") && view !== "operations") return <ChallengeReviewCenter initialKind={section === "tournaments" ? "tournament" : "all"} />;
  return <AdminControlCenter section={sections.has(section) ? section : "overview"} />;
}
