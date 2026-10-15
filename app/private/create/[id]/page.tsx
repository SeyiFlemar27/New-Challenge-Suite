import { NormalChallengeBuilder } from "@/components/normal-challenge-builder";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NormalChallengeBuilder draftId={id} privateMode />;
}
