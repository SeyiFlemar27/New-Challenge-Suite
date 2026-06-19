import { AppShell } from "@/components/app-shell";
import { EmptyState, LinkButton, PageTitle } from "@/components/ui";
import { Star } from "lucide-react";

export default function FavoritesPage() {
  return (
    <AppShell>
      <PageTitle title="My Favorites" subtitle="Your saved submissions (0)" icon={<Star className="fill-yellow-200 text-yellow-200" />} />
      <EmptyState icon={<Star />} title="No favorites yet" body="Start exploring and save your favorite submissions!" action={<LinkButton href="/feed" variant="purple" className="w-48">Explore Feed</LinkButton>} />
    </AppShell>
  );
}
