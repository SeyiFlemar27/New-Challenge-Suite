import type { Metadata } from "next";
import { StatusWorkspace } from "@/components/admin/admin-phase2-workspace";
export const metadata: Metadata = { title: "Feature Readiness" };
export default function Page() { return <StatusWorkspace mode="readiness" />; }
