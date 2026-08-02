import type { Metadata } from "next";
import { AdminCaseWorkspace } from "@/components/admin/admin-case-workspace";
export const metadata: Metadata = { title: "Disputes" };
export default function Page() { return <AdminCaseWorkspace kind="disputes" />; }
