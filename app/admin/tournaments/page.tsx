import { AdminTournamentList } from "@/components/admin/admin-tournament-workspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AdminTournamentsPage() { return <AdminTournamentList />; }
