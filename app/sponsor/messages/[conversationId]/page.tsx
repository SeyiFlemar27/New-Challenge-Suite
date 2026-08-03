import { redirect } from "next/navigation";

export default async function SponsorConversationRedirect({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  redirect(`/messages/${encodeURIComponent(conversationId)}`);
}
