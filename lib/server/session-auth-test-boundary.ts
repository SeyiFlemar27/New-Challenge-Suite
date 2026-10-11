import { getAdminAuth } from "@/lib/firebase/admin";

type SessionAuthBoundary = Pick<NonNullable<ReturnType<typeof getAdminAuth>>, "verifyIdToken" | "createSessionCookie">;

let sessionAuthOverride: SessionAuthBoundary | null = null;

export function getSessionAuthBoundary() {
  return sessionAuthOverride ?? getAdminAuth();
}

export function setSessionAuthForTests(auth: SessionAuthBoundary | null) {
  sessionAuthOverride = auth;
}
