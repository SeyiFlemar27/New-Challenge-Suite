import type { Metadata } from "next";
import { getAdminDb } from "@/lib/firebase/admin";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const db = getAdminDb();
  const snap = db ? await db.collection("tournaments").doc(id).get() : null;
  const tournament = snap?.exists ? snap.data() ?? {} : {};
  const title = typeof tournament.title === "string" && tournament.title.trim()
    ? `${tournament.title.trim().slice(0, 120)} Results`
    : "Tournament Results";
  const description = typeof tournament.description === "string" && tournament.description.trim()
    ? tournament.description.trim().slice(0, 180)
    : "View confirmed tournament placements and results on Challenge Suite.";
  return {
    title: `${title} | Challenge Suite`,
    description,
    alternates: { canonical: `/tournaments/${encodeURIComponent(id)}/results` },
    openGraph: {
      type: "website",
      title,
      description,
      url: `/tournaments/${encodeURIComponent(id)}/results`
    },
    twitter: { card: "summary", title, description }
  };
}

export default function TournamentResultsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
