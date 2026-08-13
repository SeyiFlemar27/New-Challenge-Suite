import { NormalChallengeBuilder } from "@/components/normal-challenge-builder";

export default async function EditChallengeDraftPage({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  return <NormalChallengeBuilder draftId={draftId} />;
}
