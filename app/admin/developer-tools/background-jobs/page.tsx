import type { Metadata } from "next";
import { StatusWorkspace } from "@/components/admin/admin-phase2-workspace";
export const metadata: Metadata = { title: "Background Jobs" };
export default function Page() { return <StatusWorkspace mode="jobs" />; }
