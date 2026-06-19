import { allowedRegions } from "@/lib/legal";
import { ok } from "@/lib/server/responses";

export async function GET(request: Request) {
  const headers = new Headers(request.headers);
  const country =
    headers.get("x-vercel-ip-country") ||
    headers.get("cf-ipcountry") ||
    headers.get("x-country-code") ||
    "Unknown";
  return ok({ country, allowed: allowedRegions.includes(country as "US" | "NG") }, "Region checked.");
}
