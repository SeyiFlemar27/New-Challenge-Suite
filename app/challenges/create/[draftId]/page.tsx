import { ChallengeBuilder } from "@/components/challenge-builder";

export default async function EditChallengeDraftPage({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  return <ChallengeBuilder mode="public" draftId={draftId} />;
}
