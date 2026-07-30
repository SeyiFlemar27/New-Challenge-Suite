import type { Metadata } from "next";
import { getAdminDb } from "@/lib/firebase/admin";

function text(value: unknown, fallback: string, max: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}

function publicImage(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const fallback: Metadata = {
    title: "Challenge | Challenge Suite",
    description: "View challenge details, timeline, participants, and results on Challenge Suite."
  };
  const db = getAdminDb();
  if (!db) return fallback;
  const snap = await db.collection("challenges").doc(id).get();
  if (!snap.exists) return fallback;
  const challenge = snap.data() ?? {};
  const visibility = String(challenge.visibility ?? "public").toLowerCase();
  const status = String(challenge.status ?? "").toLowerCase();
  if (visibility !== "public" || ["draft", "deleted", "hidden", "rejected"].includes(status)) return fallback;
  const title = text(challenge.title, "Challenge", 120);
  const description = text(challenge.shortDescription ?? challenge.description, "View this challenge on Challenge Suite.", 180);
  const image = publicImage(challenge.coverImageUrl ?? challenge.imageUrl);
  return {
    title: `${title} | Challenge Suite`,
    description,
    alternates: { canonical: `/challenges/${encodeURIComponent(id)}` },
    openGraph: {
      type: "website",
      title,
      description,
      url: `/challenges/${encodeURIComponent(id)}`,
      images: image ? [{ url: image, alt: title }] : undefined
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined
    }
  };
}

export default function ChallengeLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
