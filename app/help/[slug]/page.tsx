import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, LifeBuoy } from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/public-site/public-shell";
import { getAdminDb } from "@/lib/firebase/admin";
import { SUPPORT_CATEGORIES } from "@/lib/support/catalog";

type Props = { params: Promise<{ slug: string }> };
async function loadArticle(slug: string) {
  const db = getAdminDb();
  if (!db) return null;
  const result = await db.collection("helpArticles").where("slug", "==", slug).where("status", "==", "published").limit(1).get();
  if (result.empty) return null;
  const doc = result.docs[0]!;
  const value = doc.data();
  if (typeof value.title !== "string" || typeof value.body !== "string") return null;
  return {
    id: doc.id,
    title: value.title,
    body: value.body,
    summary: typeof value.summary === "string" ? value.summary : "",
    category: typeof value.category === "string" ? value.category : "other",
    slug: typeof value.slug === "string" ? value.slug : slug,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null
  };
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await loadArticle(slug);
  return article ? { title: `${article.title} | Challenge Suite Help`, description: String(article.summary ?? "Challenge Suite Help Center article.").slice(0, 300), robots: { index: false, follow: false } } : { title: "Help article | Challenge Suite", robots: { index: false, follow: false } };
}
export default async function HelpArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await loadArticle(slug);
  if (!article) notFound();
  const category = SUPPORT_CATEGORIES[String(article.category) as keyof typeof SUPPORT_CATEGORIES]?.label ?? "Help";
  return <main className="public-page"><PublicHeader/><section className="public-section"><article className="public-container max-w-3xl"><Link href="/help" className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-[#665800]"><BookOpen size={16}/>Help Center</Link><p className="mt-8 text-sm font-bold uppercase tracking-wide text-[#887500]">{category}</p><h1 className="mt-3 text-[clamp(2.25rem,5vw,3.75rem)] font-semibold leading-tight">{String(article.title)}</h1>{article.summary ? <p className="mt-5 text-lg leading-8 text-[#5e5e59]">{String(article.summary)}</p> : null}<div className="mt-9 whitespace-pre-wrap text-base leading-8 text-[#30302c]">{String(article.body)}</div><div className="mt-12 flex flex-wrap gap-3 border-t border-[#deded8] pt-6"><Link href="/support/new" className="public-primary-button justify-center"><LifeBuoy size={16}/>Contact Support</Link><Link href="/support/tickets" className="public-secondary-button justify-center">My Requests</Link></div></article></section><PublicFooter/></main>;
}
