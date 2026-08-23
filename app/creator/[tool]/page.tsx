import { notFound, redirect } from "next/navigation";
import { CreatorWorkspace } from "@/components/creator/creator-workspace";

const allowed = new Set(["analytics", "sponsor-ready", "submissions"]);

export default async function CreatorToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  if (tool === "boosts") redirect("/creator/challenges");
  if (!allowed.has(tool)) notFound();
  return <CreatorWorkspace mode={tool as "analytics" | "sponsor-ready" | "submissions"} />;
}
