"use client";

import { auth, isFirebaseConfigured } from "@/lib/firebase/client";
import { networkFailure, parseApiResponse, type ApiResult } from "@/lib/api/response-parser";

export type { ApiResult } from "@/lib/api/response-parser";
export { parseApiResponse } from "@/lib/api/response-parser";

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const headers = new Headers(init.headers);
  const requestUid = auth?.currentUser?.uid ?? null;
  headers.set("Content-Type", headers.get("Content-Type") || "application/json");
  if (isFirebaseConfigured && auth?.currentUser) {
    headers.set("Authorization", `Bearer ${await auth.currentUser.getIdToken()}`);
  }
  try {
    const response = await fetch(path, { ...init, headers, credentials: init.credentials ?? "same-origin" });
    const result = await parseApiResponse<T>(response);
    if ((auth?.currentUser?.uid ?? null) !== requestUid) return networkFailure<T>();
    return result;
  } catch {
    return networkFailure<T>();
  }
}
