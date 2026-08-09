export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" }
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];
export const DEFAULT_LANGUAGE: LanguageCode = "en";
export const LANGUAGE_STORAGE_KEY = "challenge_suite_language";

const copy = {
  en: { language: "Language", signIn: "Sign in", signUp: "Sign up", createAccount: "Create Account", settings: "Settings" },
  fr: { language: "Langue", signIn: "Se connecter", signUp: "S'inscrire", createAccount: "Créer un compte", settings: "Paramètres" },
  es: { language: "Idioma", signIn: "Iniciar sesión", signUp: "Registrarse", createAccount: "Crear una cuenta", settings: "Configuración" },
  pt: { language: "Idioma", signIn: "Entrar", signUp: "Criar conta", createAccount: "Criar conta", settings: "Configurações" }
} satisfies Record<LanguageCode, Record<string, string>>;

export function normalizeLanguage(value: unknown): LanguageCode {
  return SUPPORTED_LANGUAGES.some((language) => language.code === value) ? value as LanguageCode : DEFAULT_LANGUAGE;
}

export function translate(language: LanguageCode, key: keyof typeof copy.en) {
  return copy[language]?.[key] ?? copy.en[key];
}
