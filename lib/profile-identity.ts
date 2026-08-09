const demoPattern = /(^|[\s._-])(demo|sample|placeholder|mock|test|qa)([\s._-]|$)/i;
function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function acceptable(value: string, allowDemo: boolean) { return Boolean(value) && (allowDemo || !demoPattern.test(value)); }
function emailPrefix(value: string) { const prefix = value.includes("@") ? value.split("@")[0] : ""; return prefix.replace(/[._-]+/g, " ").trim(); }
function initials(value: string) { return value.split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "A"; }
export function isExplicitDemoEnvironment() { return process.env.NEXT_PUBLIC_DEMO_MODE === "true"; }
export function resolveProfileIdentity(input: Record<string, unknown>, fallbackEmail = "", fallbackDisplayName = "") {
  const allowDemo = isExplicitDemoEnvironment();
  const fullName = [clean(input.firstName), clean(input.lastName)].filter(Boolean).join(" ");
  const email = clean(input.email) || clean(fallbackEmail);
  const candidates = [clean(input.displayName), clean(input.name), fullName, clean(input.username), clean(input.handle), clean(fallbackDisplayName), emailPrefix(email)];
  const displayName = candidates.find((candidate) => acceptable(candidate, allowDemo)) || "Account";
  return { displayName, initials: initials(displayName) };
}
export function isDemoProfileContent(value: unknown) { return !isExplicitDemoEnvironment() && demoPattern.test(clean(value)); }
