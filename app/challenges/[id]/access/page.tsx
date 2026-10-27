"use client";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PrivateAccessManager } from "@/components/private-access-manager";
export default function PrivateAccessManagementPage() {
  const { id } = useParams<{ id: string }>();
  return <AppShell><div className="mx-auto max-w-6xl"><a href={`/challenges/${encodeURIComponent(id)}`} className="mb-5 inline-flex rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-amber-500">Back to Challenge</a><h1 className="text-3xl font-black">Private Challenge Access</h1><PrivateAccessManager challengeId={id} /></div></AppShell>;
}
