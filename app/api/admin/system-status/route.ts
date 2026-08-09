import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminPermission } from "@/lib/server/auth";
import { ok, serverUnavailable } from "@/lib/server/responses";
import { getProviderReadiness } from "@/lib/server/provider-readiness";

export async function GET(request: Request) {
  const { response } = await requireAdminPermission(request, "systemDiagnostics.view"); if (response) return response;
  const db = getAdminDb(); if (!db) return serverUnavailable("System status"); const checkedAt = new Date().toISOString();
  const incidents = await db.collection("systemIncidents").orderBy("createdAt", "desc").limit(50).get();
  const readiness = getProviderReadiness();
  const services = readiness.map((entry) => ({ ...entry, status: entry.status === "ready" ? "working_normally" : entry.status === "requires_manual_verification" ? "needs_attention" : entry.status === "disabled" ? "paused" : "not_connected", lastCheckedAt: checkedAt, providerConfigured: entry.configured }));
  return ok({ services, readiness, incidents: incidents.docs.map((doc) => ({ id: doc.id, ...doc.data() })), uptimePercentage: null });
}
