import { TournamentBuilder } from "@/components/tournament-builder";

export default async function TournamentCreatePage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const { draft } = await searchParams;
  return <TournamentBuilder draftId={draft} />;
}
