/** Next may construct an internal localhost URL; Host retains the browser-facing host. */
export function validLiveEventRequestOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  try {
    const source = new URL(origin), target = new URL(request.url);
    const host = (request.headers.get("host") ?? target.host).toLowerCase();
    return source.origin !== "null" && !source.username && !source.password && source.host.toLowerCase() === host && source.protocol === target.protocol;
  } catch { return false; }
}
