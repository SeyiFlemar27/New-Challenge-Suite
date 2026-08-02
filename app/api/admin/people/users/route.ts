import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminPermission } from "@/lib/server/auth";
import { ok, serverError, serverUnavailable } from "@/lib/server/responses";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const { response } = await requireAdminPermission(request, "users.view"); if (response) return response;
  const db = getAdminDb(); if (!db) return serverUnavailable("People");
  try { const url = new URL(request.url); const q = url.searchParams.get("q")?.trim().toLowerCase() ?? ""; const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("limit") ?? 50))); const snap = await db.collection("users").orderBy("createdAt", "desc").limit(500).get(); const users = snap.docs.map((doc) => { const data = doc.data(); return { id: doc.id, displayName: data.displayName ?? data.name ?? "User", email: data.email ?? "", workspaces: data.workspaceTypes ?? [data.accountType ?? data.role ?? "talent"], activeWorkspace: data.activeWorkspace ?? data.accountType ?? "talent", plan: data.planId ?? "free", verificationState: data.verificationStatus ?? "not_started", kycState: data.kycStatus ?? "not_started", accountStatus: data.accountStatus ?? (data.suspended ? "suspended" : "active"), withdrawalRestricted: data.withdrawalRestricted === true, createdAt: data.createdAt ?? null, lastActivityAt: data.lastActivityAt ?? data.updatedAt ?? null, riskFlags: data.riskFlags ?? [], adminRoles: data.adminRoles ?? [] }; }).filter((user) => !q || `${user.displayName} ${user.email} ${user.id}`.toLowerCase().includes(q)); return ok({ users: users.slice(0, pageSize), total: users.length, nextCursor: users.length > pageSize ? users[pageSize - 1]?.id : null }); } catch (error) { return serverError("People could not be loaded.", error instanceof Error ? error.message : error); }
}
