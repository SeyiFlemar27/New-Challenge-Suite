"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_LANGUAGE, normalizeLanguage, readBrowserLanguagePreference, translate, translateFirstPartyText, type LanguageCode } from "@/lib/i18n/config";

const textOriginals = new WeakMap<Text, string>();
const attributeOriginals = new WeakMap<Element, Map<string, string>>();
const translatedAttributes = ["aria-label", "placeholder", "title"];

function excluded(element: Element | null) {
  return Boolean(element?.closest("[data-no-translate],[data-user-content],[data-admin-ui],code,pre"));
}

function applyLanguage(language: LanguageCode) {
  document.documentElement.lang = language;
  const root = document.body;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node) {
    if (!excluded(node.parentElement)) {
      if (!textOriginals.has(node)) textOriginals.set(node, node.nodeValue ?? "");
      node.nodeValue = translateFirstPartyText(language, textOriginals.get(node) ?? "");
    }
    node = walker.nextNode() as Text | null;
  }
  for (const element of root.querySelectorAll("[aria-label],[placeholder],[title]")) {
    if (excluded(element)) continue;
    let originals = attributeOriginals.get(element);
    if (!originals) { originals = new Map(); attributeOriginals.set(element, originals); }
    for (const attribute of translatedAttributes) {
      const value = element.getAttribute(attribute);
      if (!value) continue;
      if (!originals.has(attribute)) originals.set(attribute, value);
      element.setAttribute(attribute, translate(language, originals.get(attribute) ?? value));
    }
  }
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [language, setLanguage] = useState<LanguageCode>(DEFAULT_LANGUAGE);
  const applying = useRef(false);
  const admin = pathname.startsWith("/admin");

  useEffect(() => {
    const stored = readBrowserLanguagePreference();
    setLanguage(stored);
    const change = (event: Event) => setLanguage(normalizeLanguage((event as CustomEvent).detail));
    window.addEventListener("challenge-suite-language-change", change);
    return () => window.removeEventListener("challenge-suite-language-change", change);
  }, []);

  useEffect(() => {
    const stored = readBrowserLanguagePreference();
    setLanguage((current) => current === stored ? current : stored);
  }, [pathname]);

  useEffect(() => {
    if (admin) { applyLanguage(DEFAULT_LANGUAGE); return; }
    const run = () => { applying.current = true; applyLanguage(language); applying.current = false; };
    run();
    const hydrationChecks = [100, 400, 1000].map((delay) => window.setTimeout(run, delay));
    const observer = new MutationObserver(() => { if (!applying.current) requestAnimationFrame(run); });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { hydrationChecks.forEach((timer) => window.clearTimeout(timer)); observer.disconnect(); };
  }, [admin, language, pathname]);

  return <>{children}</>;
}
