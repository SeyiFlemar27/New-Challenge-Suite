"use client";
import { useParams } from "next/navigation";
import { CreatorWorkspace } from "@/components/creator/creator-workspace";

const allowed = new Set(["analytics", "boosts", "sponsor-ready", "submissions"]);
export default function CreatorToolPage() {
  const params = useParams<{ tool: string }>();
  const mode = allowed.has(String(params.tool)) ? String(params.tool) : "analytics";
  return <CreatorWorkspace mode={mode as "analytics" | "boosts" | "sponsor-ready" | "submissions"} />;
}
