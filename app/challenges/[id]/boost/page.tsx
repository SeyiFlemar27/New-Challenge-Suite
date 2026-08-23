import { redirect } from "next/navigation";

export default async function RetiredBoostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/challenges/${id}/manage?tab=overview`);
}
