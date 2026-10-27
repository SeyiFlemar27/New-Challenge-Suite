import { redirect } from "next/navigation";

export default async function MyChallengesRedirectPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const query = await searchParams;
  redirect(query.tab === "tournaments" ? "/challenges?tab=tournaments" : "/challenges");
}
