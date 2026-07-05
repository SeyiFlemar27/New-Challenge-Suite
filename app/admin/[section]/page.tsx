import { AdminControlCenter } from "@/components/admin/admin-control-center";

const sections = new Set(["sponsors", "hosts", "challenges", "submissions", "participants", "winners", "withdrawals", "reports", "users", "audit-logs", "settings"]);

export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return <AdminControlCenter section={sections.has(section) ? section : "overview"} />;
}
