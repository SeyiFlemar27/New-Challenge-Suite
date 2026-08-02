import type { Metadata } from "next";
import { ActionCentreWorkspace } from "@/components/admin/admin-phase2-workspace";
export const metadata: Metadata = { title: "Action Centre" };
export default function Page() { return <ActionCentreWorkspace />; }
