import type { Metadata } from "next";
import { UserControlCentre } from "@/components/admin/admin-phase2-workspace";
export const metadata: Metadata = { title: "User Control Centre" };
export default async function Page({ params }: { params: Promise<{ uid: string }> }) { return <UserControlCentre uid={(await params).uid} />; }
