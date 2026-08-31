"use client";

import { useEffect } from "react";
import { DEFAULT_LANGUAGE } from "@/lib/i18n/config";

export function I18nProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = DEFAULT_LANGUAGE;
  }, []);

  return <>{children}</>;
}
