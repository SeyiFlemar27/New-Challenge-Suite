import type { Metadata } from "next";
import { PublicContentEditor } from "@/components/admin/public-content-editor";
export const metadata: Metadata = { title: "Public Content" };
export default function PublicContentPage() { return <PublicContentEditor />; }
