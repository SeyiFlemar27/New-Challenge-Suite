export type WorkspaceId = "personal" | "sponsor" | "enterprise";
export type WorkspaceSurface = WorkspaceId | "admin" | "shared";

export type WorkspaceRouteClassification = {
  surface: string;
  prefixes: readonly string[];
  semantics: WorkspaceSurface;
  requiredWorkspace: WorkspaceId | null;
};

export const WORKSPACE_ROUTE_CLASSIFICATIONS: readonly WorkspaceRouteClassification[] = [
  { surface: "Admin", prefixes: ["/admin"], semantics: "admin", requiredWorkspace: null },
  { surface: "Sponsor application", prefixes: ["/sponsor/start"], semantics: "personal", requiredWorkspace: "personal" },
  { surface: "Sponsor workspace", prefixes: ["/sponsor"], semantics: "sponsor", requiredWorkspace: "sponsor" },
  { surface: "Enterprise application", prefixes: ["/enterprise/apply", "/enterprise/status", "/enterprise/application"], semantics: "shared", requiredWorkspace: null },
  { surface: "Enterprise operations", prefixes: ["/enterprise"], semantics: "enterprise", requiredWorkspace: "enterprise" },
  { surface: "Personal plans", prefixes: ["/subscriptions", "/settings/billing", "/settings/customization"], semantics: "personal", requiredWorkspace: "personal" },
  { surface: "Personal wallet", prefixes: ["/wallet", "/earnings", "/settings/wallet", "/settings/payouts"], semantics: "personal", requiredWorkspace: "personal" },
  { surface: "DoroCoins", prefixes: ["/dorocoins", "/checkout/dorocoins"], semantics: "personal", requiredWorkspace: "personal" },
  { surface: "Rewards", prefixes: ["/rewards"], semantics: "personal", requiredWorkspace: "personal" },
  { surface: "Personal dashboards", prefixes: ["/dashboard", "/host", "/creator", "/my-entries", "/my-challenges"], semantics: "personal", requiredWorkspace: "personal" },
  { surface: "Personal saved and creation", prefixes: ["/favorites", "/challenges/create", "/private/create"], semantics: "personal", requiredWorkspace: "personal" },
  { surface: "Shared account and discovery", prefixes: ["/explore", "/profile", "/settings", "/messages", "/notifications", "/leaderboards", "/winners", "/challenges"], semantics: "shared", requiredWorkspace: null },
] as const;

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

export function classifyWorkspaceRoute(pathname: string): WorkspaceRouteClassification {
  return WORKSPACE_ROUTE_CLASSIFICATIONS.find((entry) => entry.prefixes.some((prefix) => matchesPrefix(pathname, prefix))) ?? {
    surface: "Shared application",
    prefixes: [],
    semantics: "shared",
    requiredWorkspace: null,
  };
}

export function validatedActiveWorkspace(active: WorkspaceId | undefined, available: readonly WorkspaceId[]) {
  return active && available.includes(active) ? active : "personal";
}

export function workspaceForRoute(pathname: string, active: WorkspaceId | undefined, available: readonly WorkspaceId[]) {
  const route = classifyWorkspaceRoute(pathname);
  if (route.requiredWorkspace && available.includes(route.requiredWorkspace)) return route.requiredWorkspace;
  if (route.semantics === "admin") return null;
  return validatedActiveWorkspace(active, available);
}

export function workspaceRouteNeedsSwitch(pathname: string, active: WorkspaceId | undefined, available: readonly WorkspaceId[]) {
  const required = classifyWorkspaceRoute(pathname).requiredWorkspace;
  if (!required || !available.includes(required)) return null;
  return validatedActiveWorkspace(active, available) === required ? null : required;
}
