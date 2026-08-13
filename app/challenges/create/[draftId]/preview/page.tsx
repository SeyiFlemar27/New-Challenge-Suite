import { redirect } from "next/navigation";

export default async function RemovedChallengeDraftPreview({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  redirect(`/challenges/create/${draftId}`);
}
