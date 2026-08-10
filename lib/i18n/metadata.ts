import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LANGUAGE_STORAGE_KEY, normalizeLanguage, translate } from "@/lib/i18n/config";

export async function fixedPublicMetadata({ title, description, canonical, openGraphTitle = title, openGraphDescription = description, image }: { title: string; description: string; canonical: string; openGraphTitle?: string; openGraphDescription?: string; image?: string }): Promise<Metadata> {
  const language = normalizeLanguage((await cookies()).get(LANGUAGE_STORAGE_KEY)?.value);
  return {
    title: translate(language, title),
    description: translate(language, description),
    alternates: { canonical },
    openGraph: { title: translate(language, openGraphTitle), description: translate(language, openGraphDescription), url: canonical, images: image ? [image] : undefined },
    twitter: { title: translate(language, openGraphTitle), description: translate(language, openGraphDescription), images: image ? [image] : undefined }
  };
}
