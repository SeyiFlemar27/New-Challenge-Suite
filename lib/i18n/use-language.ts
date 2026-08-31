"use client";

import { DEFAULT_LANGUAGE, translate } from "@/lib/i18n/config";

export function useLanguage() {
  return {
    language: DEFAULT_LANGUAGE,
    t: (key: Parameters<typeof translate>[1]) => translate(DEFAULT_LANGUAGE, key),
  };
}
