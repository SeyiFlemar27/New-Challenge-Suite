import type { Metadata } from "next";
import { HelpCentre } from "@/components/admin/admin-phase2-workspace";
export const metadata: Metadata = { title: "Admin Help" };
export default function Page() { return <HelpCentre />; }
