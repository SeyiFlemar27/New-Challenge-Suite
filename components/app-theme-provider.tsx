"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/components/auth-provider";
import { apiRequest } from "@/lib/api/client";

export type AppTheme = "light" | "dark" | "system";

const STORAGE_KEY = "challenge-suite-appearance";
const THEME_EVENT = "challenge-suite:theme";

function isTheme(value: string | null): value is AppTheme {
  return value === "light" || value === "dark" || value === "system";
}

function getThemeSnapshot(): AppTheme {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isTheme(stored) ? stored : "light";
}

function subscribeTheme(onChange: () => void) {
  const handleStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY) onChange(); };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(THEME_EVENT, onChange);
  return () => { window.removeEventListener("storage", handleStorage); window.removeEventListener(THEME_EVENT, onChange); };
}

function saveTheme(theme: AppTheme) {
  window.localStorage.setItem(STORAGE_KEY, theme);
  window.dispatchEvent(new Event(THEME_EVENT));
}

function applyTheme(theme: AppTheme) {
  const resolved = theme === "system"
    ? window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"
    : theme;
  document.documentElement.dataset.appThemePreference = theme;
  document.documentElement.dataset.appTheme = resolved;
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const theme = useSyncExternalStore<AppTheme>(subscribeTheme, getThemeSnapshot, () => "light");
  const hasBrowserPreference = useSyncExternalStore(subscribeTheme, () => isTheme(window.localStorage.getItem(STORAGE_KEY)), () => false);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (loading || !user || hasBrowserPreference || isTheme(localStorage.getItem(STORAGE_KEY))) return;
    let active = true;
    void apiRequest<{ preferences?: { appearance?: string } }>("/api/settings").then((result) => {
      if (!active) return;
      const appearance = result.data?.preferences?.appearance ?? null;
      const saved: AppTheme = result.ok && isTheme(appearance) ? appearance : "light";
      saveTheme(saved);
    });
    return () => { active = false; };
  }, [hasBrowserPreference, loading, user]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => theme === "system" && applyTheme("system");
    media.addEventListener("change", onChange);
    return () => {
      media.removeEventListener("change", onChange);
    };
  }, [theme]);

  return children;
}

export function setAppTheme(theme: AppTheme) {
  saveTheme(theme);
}
