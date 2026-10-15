"use client";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PrivateAccessManager } from "@/components/private-access-manager";
export default function PrivateAccessManagementPage() {
  const { id } = useParams<{ id: string }>();
  return <AppShell><div className="mx-auto max-w-4xl"><h1 className="text-3xl font-black">Private Challenge Access</h1><PrivateAccessManager challengeId={id} /></div></AppShell>;
}
