"use client";

import { Languages } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, normalizeLanguage, readBrowserLanguagePreference, SUPPORTED_LANGUAGES, type LanguageCode } from "@/lib/i18n/config";

function subscribeLanguage(onChange: () => void) {
  const handleStorage = (event: StorageEvent) => { if (event.key === LANGUAGE_STORAGE_KEY) onChange(); };
  window.addEventListener("storage", handleStorage);
  window.addEventListener("challenge-suite-language-change", onChange);
  return () => { window.removeEventListener("storage", handleStorage); window.removeEventListener("challenge-suite-language-change", onChange); };
}

function getLanguageSnapshot(): LanguageCode { return readBrowserLanguagePreference(); }

function saveLanguage(language: LanguageCode) {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  document.cookie = `${LANGUAGE_STORAGE_KEY}=${language};path=/;max-age=31536000;samesite=lax`;
  document.documentElement.lang = language;
  window.dispatchEvent(new CustomEvent("challenge-suite-language-change", { detail: language }));
}

export function LanguageSelector({ compact = false, persistAccount = false }: { compact?: boolean; persistAccount?: boolean }) {
  const language = useSyncExternalStore(subscribeLanguage, getLanguageSnapshot, () => DEFAULT_LANGUAGE);
  useEffect(() => {
    const saved = readBrowserLanguagePreference();
    if (saved !== DEFAULT_LANGUAGE || !persistAccount) {
      const next = saved;
      document.documentElement.lang = next;
      return;
    }
    fetch("/api/profile/language", { cache: "no-store" }).then((response) => response.json()).then((body) => {
      if (!body?.ok || !body?.data?.language) return;
      const next = normalizeLanguage(body.data.language);
      saveLanguage(next);
    }).catch(() => undefined);
  }, [persistAccount]);

  async function change(value: string) {
    const next = normalizeLanguage(value);
    saveLanguage(next);
    if (persistAccount) await fetch("/api/profile/language", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ language: next }) }).catch(() => undefined);
  }

  return <label className={`inline-flex items-center gap-2 ${compact ? "text-xs" : "text-sm"}`}><Languages size={compact ? 15 : 17} aria-hidden="true" /><span className="sr-only">Language</span><select aria-label="Language" value={language} onChange={(event) => void change(event.target.value)} className="min-h-9 rounded-[8px] border border-current/20 bg-transparent px-2 font-bold outline-none focus:border-[#b59c00]">{SUPPORTED_LANGUAGES.map((item) => <option key={item.code} value={item.code} className="text-black">{item.label}</option>)}</select></label>;
}
