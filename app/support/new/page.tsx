import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { SupportTicketForm } from "@/components/support-ticket-form";
export const metadata: Metadata = { title: "Support" };
export default function Page() { return <AppShell><div className="mx-auto max-w-3xl"><SupportTicketForm /></div></AppShell>; }
