import type { LanguageCode } from "@/lib/i18n/config";

export type DynamicContentType = "challenge_title" | "challenge_description" | "challenge_rules" | "submission_caption" | "profile_bio" | "sponsor_description" | "campaign_description" | "event_content" | "announcement" | "support_content" | "faq_content";
export type DynamicTranslations = Partial<Record<LanguageCode, string>>;

export interface DynamicContentInput {
  text: string;
  targetLanguage: LanguageCode;
  translations?: DynamicTranslations | null;
  contentType: DynamicContentType;
  visibility: "public" | "authorized_user";
}

export interface DynamicContentResult {
  original: string;
  displayed: string;
  translated: boolean;
  translationAvailable: boolean;
  providerStatus: "original" | "pretranslated" | "unavailable";
}

const forbiddenFieldPattern = /(secret|password|token|private[_-]?key|payment[_-]?id|stripe[_-]?id|firebase[_-]?id|kyc[_-]?id|audit[_-]?id|wallet[_-]?id)/i;
const identifierPattern = /^(?:https?:\/\/|mailto:|tel:|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|[A-Za-z0-9_-]{18,})/;

export function isSafeDynamicDisplayText(text: string) {
  const value = text.trim();
  return Boolean(value) && !forbiddenFieldPattern.test(value) && !identifierPattern.test(value);
}

export function translateDynamicContent(input: DynamicContentInput): DynamicContentResult {
  const original = String(input.text ?? "");
  if (input.targetLanguage === "en" || !isSafeDynamicDisplayText(original)) {
    return { original, displayed: original, translated: false, translationAvailable: false, providerStatus: "original" };
  }
  const translated = String(input.translations?.[input.targetLanguage] ?? "").trim();
  if (translated && translated !== original && isSafeDynamicDisplayText(translated)) {
    return { original, displayed: translated, translated: true, translationAvailable: true, providerStatus: "pretranslated" };
  }
  return { original, displayed: original, translated: false, translationAvailable: false, providerStatus: "unavailable" };
}
