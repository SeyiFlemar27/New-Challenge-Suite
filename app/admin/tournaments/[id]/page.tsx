import { AdminTournamentDetail } from "@/components/admin/admin-tournament-workspace";

export default async function AdminTournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminTournamentDetail id={id} />;
}
