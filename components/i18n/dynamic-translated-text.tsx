"use client";

import { useEffect, useMemo, useState } from "react";
import { translateDynamicContent, type DynamicContentType, type DynamicTranslations } from "@/lib/i18n/dynamic-content";
import { useLanguage } from "@/lib/i18n/use-language";

export function DynamicTranslatedText({ text, translations, contentType, className, as = "span", showUnavailable = false }: { text: string; translations?: DynamicTranslations | null; contentType: DynamicContentType; className?: string; as?: "span" | "p" | "h1" | "h2"; showUnavailable?: boolean }) {
  const { language, t } = useLanguage();
  const result = useMemo(() => translateDynamicContent({ text, translations, contentType, targetLanguage: language, visibility: "public" }), [contentType, language, text, translations]);
  const [showTranslated, setShowTranslated] = useState(true);
  useEffect(() => setShowTranslated(true), [language, text]);
  const displayed = result.translationAvailable && showTranslated ? result.displayed : result.original;
  const Tag = as;
  return <div data-dynamic-content data-user-content className="contents"><Tag className={className}>{displayed}</Tag>{result.translationAvailable ? <button type="button" onClick={() => setShowTranslated((value) => !value)} className="mt-2 block text-xs font-bold text-[var(--gold)] underline underline-offset-4">{showTranslated ? t("Show original") : t("Show translated")}</button> : showUnavailable && language !== "en" ? <small className="mt-2 block text-xs text-slate-400">{t("Translation unavailable for this content.")}</small> : null}</div>;
}
