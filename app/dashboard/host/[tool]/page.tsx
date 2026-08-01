import { redirect } from "next/navigation";

export default async function LegacyHostToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  redirect("/host/" + encodeURIComponent(tool));
}