import { getAdminDb } from "@/lib/firebase/admin";
import { providerConfigurationStatus } from "@/lib/server/admin-operations";
import { requireAdminPermission } from "@/lib/server/auth";
import { ok, serverUnavailable } from "@/lib/server/responses";

export async function GET(request: Request) {
  const { response } = await requireAdminPermission(request, "systemDiagnostics.view"); if (response) return response;
  const db = getAdminDb(); if (!db) return serverUnavailable("System status"); const config = providerConfigurationStatus(); const checkedAt = new Date().toISOString();
  const incidents = await db.collection("systemIncidents").orderBy("createdAt", "desc").limit(50).get();
  const services = [
    ["Payments", config.payments], ["Uploads", config.uploads], ["Authentication", config.authentication], ["Email", config.email],
    ["Identity verification", config.identityVerification], ["Refund provider", config.refundProvider], ["Chargeback/dispute provider", config.chargebackProvider]
  ].map(([name, configured]) => ({ name, status: configured ? "working_normally" : "not_connected", lastCheckedAt: checkedAt, explanation: configured ? "Provider configuration is present. Runtime incidents are shown separately." : "Provider configuration is not present in this environment.", providerConfigured: configured }));
  return ok({ services, incidents: incidents.docs.map((doc) => ({ id: doc.id, ...doc.data() })), uptimePercentage: null });
}
