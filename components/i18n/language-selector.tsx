"use client";

import { Languages } from "lucide-react";
import { useEffect, useState } from "react";
import { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, normalizeLanguage, SUPPORTED_LANGUAGES, type LanguageCode } from "@/lib/i18n/config";

export function LanguageSelector({ compact = false, persistAccount = false }: { compact?: boolean; persistAccount?: boolean }) {
  const [language, setLanguage] = useState<LanguageCode>(DEFAULT_LANGUAGE);
  useEffect(() => setLanguage(normalizeLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY))), []);

  async function change(value: string) {
    const next = normalizeLanguage(value);
    setLanguage(next);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    document.cookie = `${LANGUAGE_STORAGE_KEY}=${next};path=/;max-age=31536000;samesite=lax`;
    document.documentElement.lang = next;
    window.dispatchEvent(new CustomEvent("challenge-suite-language-change", { detail: next }));
    if (persistAccount) await fetch("/api/profile/language", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ language: next }) }).catch(() => undefined);
  }

  return <label className={`inline-flex items-center gap-2 ${compact ? "text-xs" : "text-sm"}`}><Languages size={compact ? 15 : 17} aria-hidden="true" /><span className="sr-only">Language</span><select aria-label="Language" value={language} onChange={(event) => void change(event.target.value)} className="min-h-9 rounded-[8px] border border-current/20 bg-transparent px-2 font-bold outline-none focus:border-[#b59c00]">{SUPPORTED_LANGUAGES.map((item) => <option key={item.code} value={item.code} className="text-black">{item.label}</option>)}</select></label>;
}
