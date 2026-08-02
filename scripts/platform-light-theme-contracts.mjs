import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { read } from "./production-flow-test-utils.mjs";

const files = {
  layout: read("app/layout.tsx"),
  css: read("app/globals.css"),
  provider: read("components/app-theme-provider.tsx"),
  settings: read("app/settings/[section]/page.tsx"),
  settingsApi: read("app/api/settings/route.ts"),
  ui: read("components/ui.tsx"),
  appShell: read("components/app-shell.tsx"),
  sidebar: read("components/sidebar.tsx"),
  topbar: read("components/authenticated-topbar.tsx"),
  footer: read("components/mobile-footer.tsx"),
  admin: read("components/admin/admin-shell.tsx"),
  sponsor: read("components/sponsor/sponsor-shell.tsx"),
  auth: read("app/auth/layout.tsx") + read("components/verification-guard.tsx"),
  onboarding: read("components/onboarding-shell.tsx"),
  publicHome: read("components/public-site/public-home.tsx"),
  publicShell: read("components/public-site/public-shell.tsx"),
  publicTalent: read("components/public-site/for-talent-experience.tsx"),
  category: read("components/public-site/category-experience.tsx")
};

function has(source, values) {
  for (const value of values) assert.ok(source.includes(value), `Missing light-theme contract: ${value}`);
}

function luminance(hex) {
  const rgb = hex.match(/[a-f\d]{2}/gi).map((value) => parseInt(value, 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(tsx?|css)$/.test(name) ? [path] : [];
  });
}

export function runLightThemeContract(name) {
  const shared = Object.values(files).join("\n");
  if (name === "platform-default-theme-light-everywhere") {
    has(files.layout, ['data-app-theme="light"', 'data-app-theme-preference="light"']);
    has(files.provider, ['useState<AppTheme>("light")', 'stored : "light"']);
    has(files.css, ["--background: #f7f8fa", "--panel: #ffffff", ".theme-workspace"]);
  } else if (name === "public-landing-default-light") {
    has(files.publicHome + files.publicShell + files.css, ["public-page", "background:#fff", "public-header", "public-primary-button"]);
  } else if (name === "public-pages-default-light") {
    has(files.publicTalent + files.category + files.publicShell + files.css, ["public-page", "public-container", "background:#fff"]);
  } else if (name === "auth-pages-default-light") {
    has(files.auth + files.onboarding + files.css, ["auth-shell", "onboarding-shell", "theme-workspace", "var(--background)"]);
  } else if (name === "dashboard-default-light") {
    has(files.appShell + files.sidebar + files.topbar, ["theme-workspace", "var(--background)", "bg-[var(--panel)]"]);
    assert.ok(!files.appShell.includes("bg-black"));
  } else if (name === "sponsor-dashboard-default-light") {
    has(files.sponsor, ["sponsor-mobile-shell theme-workspace", "bg-[var(--background)]", "bg-[var(--panel)]"]);
  } else if (name === "admin-panel-default-light" || name === "admin-sidebar-light-premium-treatment") {
    has(files.admin + files.css, ["admin-mobile-shell theme-workspace", "bg-[var(--background)]", "bg-[var(--panel)]", "Admin follows the light workspace"]);
  } else if (name === "theme-dark-remains-optional") {
    has(files.provider + files.settings + files.css, ['"dark"', 'data-app-theme="dark"', "--background: #000000"]);
  } else if (name === "theme-system-default-remains-available") {
    has(files.provider + files.settings, ['"system"', "prefers-color-scheme: light", "System Default"]);
  } else if (name === "theme-existing-user-dark-preference-preserved") {
    has(files.layout + files.provider, ["localStorage.getItem('challenge-suite-appearance')", "isTheme(stored)", "applyTheme(initial)"]);
  } else if (name === "theme-preference-firestore-localstorage") {
    has(files.provider + files.settings + files.settingsApi, ['localStorage.setItem(STORAGE_KEY, saved)', 'apiRequest<{ preferences?', 'collection("userPreferences")', "setAppTheme"]);
  } else if (name === "gold-primary-brand-accent-preserved") {
    has(files.css + files.ui + files.sidebar, ["--gold: #f5d90a", "bg-[var(--gold)]", "focus-visible", "aria-current"]);
  } else if (name === "black-not-dominant-default-theme") {
    assert.match(files.css, /:root\s*\{[\s\S]*--background: #f7f8fa[\s\S]*--panel: #ffffff/);
    assert.ok(!files.appShell.includes("bg-black"));
    assert.ok(!files.admin.includes('admin-mobile-shell min-h-screen overflow-x-hidden bg-[#080808]'));
    assert.ok(!files.sponsor.includes("sponsor-mobile-shell min-h-screen overflow-x-hidden bg-black"));
  } else if (name === "light-theme-accessibility-contrast") {
    assert.ok(contrast("171717", "ffffff") >= 4.5, "Charcoal on white must meet WCAG AA.");
    assert.ok(contrast("000000", "f5d90a") >= 4.5, "Black on the gold primary action must meet WCAG AA.");
    has(files.css + files.ui, ["focus-visible", "--gold-strong: #8a7400", "--line: #d9dde3", "disabled:opacity-50"]);
  } else if (name === "light-theme-mobile-no-overflow") {
    has(files.css + files.appShell + files.admin + files.sponsor, ["overflow-x: clip", "overflow-x-hidden", "@media (max-width: 767px)", "min-w-0"]);
  } else if (name === "no-foundation-wording-visible") {
    for (const file of [files.appShell, files.admin, files.sponsor, files.publicHome, files.auth]) {
      const userFacingSource = file.replace(/^import .*$/gm, "");
      assert.ok(!/\bfoundation\b/i.test(userFacingSource), "Core user-facing shells must not expose foundation wording.");
    }
  } else if (name === "no-decorative-emojis-outside-sidebar") {
    for (const path of [...sourceFiles("app"), ...sourceFiles("components")]) {
      if (relative(process.cwd(), path).replaceAll("\\", "/") === "components/sidebar.tsx") continue;
      assert.ok(!/\p{Extended_Pictographic}/u.test(read(relative(process.cwd(), path))), `Decorative emoji found in ${path}`);
    }
  } else {
    throw new Error(`Unknown light-theme contract: ${name}`);
  }
  console.log(`PASS ${name}`);
}