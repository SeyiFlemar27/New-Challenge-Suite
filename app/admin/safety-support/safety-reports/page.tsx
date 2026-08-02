import type { Metadata } from "next";
import { AdminCaseWorkspace } from "@/components/admin/admin-case-workspace";
export const metadata: Metadata = { title: "Safety Reports" };
export default function Page() { return <AdminCaseWorkspace kind="safety" />; }
