"use client";

import { useEffect, useState } from "react";

export type AppTheme = "light" | "dark" | "system";

const STORAGE_KEY = "challenge-suite-appearance";

function isTheme(value: string | null): value is AppTheme {
  return value === "light" || value === "dark" || value === "system";
}

function applyTheme(theme: AppTheme) {
  const resolved = theme === "system"
    ? window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"
    : theme;
  document.documentElement.dataset.appThemePreference = theme;
  document.documentElement.dataset.appTheme = resolved;
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<AppTheme>("dark");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const initial = isTheme(stored) ? stored : "dark";
    setTheme(initial);
    applyTheme(initial);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => theme === "system" && applyTheme("system");
    const onThemeChange = (event: Event) => {
      const next = (event as CustomEvent<AppTheme>).detail;
      if (!isTheme(next)) return;
      setTheme(next);
      localStorage.setItem(STORAGE_KEY, next);
      applyTheme(next);
    };
    media.addEventListener("change", onChange);
    window.addEventListener("challenge-suite:theme", onThemeChange);
    return () => {
      media.removeEventListener("change", onChange);
      window.removeEventListener("challenge-suite:theme", onThemeChange);
    };
  }, [theme]);

  return children;
}

export function setAppTheme(theme: AppTheme) {
  window.dispatchEvent(new CustomEvent<AppTheme>("challenge-suite:theme", { detail: theme }));
}
