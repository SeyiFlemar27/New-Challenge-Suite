"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { translateDynamicContent, type DynamicTranslations } from "@/lib/i18n/dynamic-content";
import { useLanguage } from "@/lib/i18n/use-language";

export function ChallengeDescription({ description, translations }: { description: string; translations?: DynamicTranslations }) {
  const { language, t } = useLanguage();
  const translation = useMemo(() => translateDynamicContent({ text: description, translations, contentType: "challenge_description", targetLanguage: language, visibility: "public" }), [description, language, translations]);
  return <MeasuredChallengeDescription key={`${language}:${description}`} translation={translation} language={language} t={t} />;
}

function MeasuredChallengeDescription({ translation, language, t }: { translation: ReturnType<typeof translateDynamicContent>; language: string; t: (value: string) => string }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const [showTranslated, setShowTranslated] = useState(true);
  const displayed = translation.translationAvailable && showTranslated ? translation.displayed : translation.original;

  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;
    const measure = () => setOverflows(element.scrollHeight > element.clientHeight + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [displayed]);

  return <div className="relative">
    <div
      className="break-words whitespace-pre-wrap text-base leading-7 text-slate-200 sm:text-xl"
      style={expanded ? undefined : { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 5, overflow: "hidden" }}
    >{displayed}</div>
    <div ref={contentRef} aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 break-words whitespace-pre-wrap text-base leading-7 opacity-0 sm:text-xl" style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 5, overflow: "hidden" }}>{displayed}</div>
    {translation.translationAvailable ? <button type="button" onClick={() => setShowTranslated((value) => !value)} className="mt-2 block min-h-11 rounded px-2 text-xs font-bold text-[var(--gold)] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]">{showTranslated ? t("Show original") : t("Show translated")}</button> : null}
    {!translation.translationAvailable && language !== "en" ? <small className="mt-2 block text-xs text-slate-400">{t("Translation unavailable for this content.")}</small> : null}
    {overflows ? <button type="button" className="mt-2 min-h-11 rounded px-2 text-sm font-bold text-[var(--gold)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? "See less" : "See more"}</button> : null}
  </div>;
}
