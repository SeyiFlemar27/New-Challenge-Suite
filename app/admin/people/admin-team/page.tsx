import type { Metadata } from "next";
import { AdminTeamWorkspace } from "@/components/admin/admin-phase2-workspace";
export const metadata: Metadata = { title: "Admin Team" };
export default function Page() { return <AdminTeamWorkspace />; }
