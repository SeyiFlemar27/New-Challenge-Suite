export const REMEMBER_ME_STORAGE_KEY = "challenge_suite_remember_me";

type BrowserStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type SessionPolicyWindow = { localStorage: BrowserStorage; sessionStorage: BrowserStorage };

function browserWindow(): SessionPolicyWindow | null {
  return typeof window === "undefined" ? null : window;
}

export function setRememberMePreference(rememberMe: boolean) {
  const browser = browserWindow();
  if (!browser) return;
  try {
    browser.sessionStorage.setItem(REMEMBER_ME_STORAGE_KEY, rememberMe ? "remember" : "standard");
    if (rememberMe) browser.localStorage.setItem(REMEMBER_ME_STORAGE_KEY, "remember");
    else browser.localStorage.removeItem(REMEMBER_ME_STORAGE_KEY);
  } catch { /* Storage can be disabled; the standard session remains the fallback. */ }
}

export function getRememberMePreference() {
  const browser = browserWindow();
  if (!browser) return false;
  try {
    const sessionChoice = browser.sessionStorage.getItem(REMEMBER_ME_STORAGE_KEY);
    if (sessionChoice === "remember") return true;
    if (sessionChoice === "standard") return false;
    return browser.localStorage.getItem(REMEMBER_ME_STORAGE_KEY) === "remember";
  } catch { return false; }
}
