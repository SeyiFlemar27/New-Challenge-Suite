import type { Metadata } from "next";
import { StatusWorkspace } from "@/components/admin/admin-phase2-workspace";
export const metadata: Metadata = { title: "System Status" };
export default function Page() { return <StatusWorkspace mode="status" />; }
