/** Public page shells are not access grants: server projections still enforce privacy. */
export function isPublicTournamentRoute(pathname: string) {
  if (pathname === "/tournaments") return true;
  const match = /^\/tournaments\/([^/]+)(?:\/results|\/matches\/[^/]+|\/teams\/entrant-\d{1,3})?\/?$/.exec(pathname);
  return Boolean(match && !["create", "new", "manage", "settings"].includes(match[1]));
}
