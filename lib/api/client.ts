"use client";

import { auth, isFirebaseConfigured } from "@/lib/firebase/client";

export interface ApiResult<T> {
  ok: boolean;
  message: string;
  data?: T;
  setupRequired?: boolean;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", headers.get("Content-Type") || "application/json");
  if (isFirebaseConfigured && auth?.currentUser) {
    headers.set("Authorization", `Bearer ${await auth.currentUser.getIdToken()}`);
  }
  const response = await fetch(path, { ...init, headers });
  const body = await response.json().catch(() => ({ ok: false, message: "Invalid server response." }));
  if (!response.ok) return body;
  return body;
}
