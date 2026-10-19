export function isInternalStoragePath(path: string, prefixes: readonly string[]) {
  return Boolean(path && prefixes.some((prefix) => path.startsWith(prefix)) && !path.includes("..") && !/^https?:/i.test(path));
}

export function isApplicationMediaUrl(value: string, path?: string) {
  if (!value.startsWith("/api/challenge-media?")) return false;
  try {
    const parsed = new URL(value, "https://application.invalid");
    const object = parsed.searchParams.get("path");
    return parsed.pathname === "/api/challenge-media" && !parsed.hash && [...parsed.searchParams.keys()].length === 1
      && Boolean(object) && !object!.includes("..") && !object!.startsWith("/") && (!path || object === path);
  } catch { return false; }
}

export function isStorageDownloadUrlForPath(url: string, path: string) {
  if (!url || !path) return false;
  if (isApplicationMediaUrl(url, path)) return true;
  const frozenTournament = /^verified-tournament-media\/([^/]+)\/([a-f0-9]{64})$/.exec(path);
  if (frozenTournament && url === `/api/tournaments/${encodeURIComponent(frozenTournament[1])}/media/${frozenTournament[2]}`) return true;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const decodedPath = decodeURIComponent(parsed.pathname);
    const firebaseHost = parsed.hostname === "firebasestorage.googleapis.com";
    const googleStorageHost = parsed.hostname === "storage.googleapis.com";
    const localStorageHost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (firebaseHost) return decodedPath.endsWith(`/o/${path}`);
    if (googleStorageHost || localStorageHost) return decodedPath.endsWith(`/${path}`);
    return false;
  } catch {
    return false;
  }
}

export function validateOwnedStorageMedia(input: { url: string; path: string; prefixes: readonly string[] }) {
  if (!input.url && !input.path) return { valid: true as const };
  if (!input.url || !input.path) return { valid: false as const, code: "MEDIA_URL_PATH_PAIR_REQUIRED", message: "Uploaded media must include both its download URL and confirmed storage path." };
  if (!isInternalStoragePath(input.path, input.prefixes)) return { valid: false as const, code: "INVALID_MEDIA_STORAGE_PATH", message: "Media must use an authenticated Challenge Suite storage path." };
  if (!isStorageDownloadUrlForPath(input.url, input.path)) return { valid: false as const, code: "UNVERIFIED_MEDIA_URL", message: "Media URL must match its confirmed Challenge Suite storage path." };
  return { valid: true as const };
}
