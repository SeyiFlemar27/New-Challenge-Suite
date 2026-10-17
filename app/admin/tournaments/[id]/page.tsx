import { AdminTournamentDetail } from "@/components/admin/admin-tournament-workspace";
import { AdminTournamentDecisions } from "@/components/admin/admin-tournament-decisions";

export default async function AdminTournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <><AdminTournamentDetail id={id} /><AdminTournamentDecisions id={id} /></>;
}
export const dynamic = "force-dynamic";
export const revalidate = 0;
