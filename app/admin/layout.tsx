import { AdminShell } from "@/components/admin/admin-shell";
import type { Metadata } from "next";

export const metadata: Metadata = { title: { default: "Admin", template: "%s | Challenge Suite" } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
