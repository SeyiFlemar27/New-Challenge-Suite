/** Guest event discovery/detail only. Management and creation remain protected. */
export function isPublicLiveEventRoute(pathname: string) {
  if (pathname === "/live-events") return true;
  const match = pathname.match(/^\/live-events\/([A-Za-z0-9_-]{1,150})(?:\/ticket)?$/);
  return Boolean(match && !["create", "host", "manage", "check-in"].includes(match[1]));
}
