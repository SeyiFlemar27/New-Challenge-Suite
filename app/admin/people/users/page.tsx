import type { Metadata } from "next";
import { PeopleWorkspace } from "@/components/admin/admin-phase2-workspace";
export const metadata: Metadata = { title: "People" };
export default function Page() { return <PeopleWorkspace />; }
