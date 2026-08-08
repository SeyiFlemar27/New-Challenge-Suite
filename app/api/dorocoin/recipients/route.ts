import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { ok, serverError, serverUnavailable, validationError } from "@/lib/server/responses";

export const dynamic = "force-dynamic";

function emailHint(value: unknown) {
  const email = String(value ?? "").trim();
  const [local, domain] = email.split("@");
  if (!local || !domain) return null;
  return `${local.slice(0, 2)}${"*".repeat(Math.min(4, Math.max(1, local.length - 2)))}@${domain}`;
}

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const query = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
  if (query.length < 2) return validationError({ q: "Enter at least two characters to search for a recipient." });
  const db = getAdminDb();
  if (!db) return serverUnavailable("DoroCoin recipient search");
  try {
    const [users, profiles] = await Promise.all([
      db.collection("users").limit(300).get(),
      db.collection("profiles").limit(300).get()
    ]);
    const profileById = new Map(profiles.docs.map((doc) => [doc.id, doc.data()]));
    const recipients = users.docs.flatMap((doc) => {
      if (doc.id === user.uid) return [];
      const account = doc.data();
      const profile = profileById.get(doc.id) ?? {};
      const status = String(account.accountStatus ?? "active");
      if (account.suspended === true || !["active", "verified"].includes(status)) return [];
      const displayName = String(profile.displayName ?? account.displayName ?? profile.name ?? account.name ?? "Challenge Suite member");
      const username = String(profile.username ?? profile.handle ?? account.username ?? "").replace(/^@/, "");
      const email = String(account.email ?? profile.email ?? "");
      if (!`${displayName} ${username} ${email}`.toLowerCase().includes(query)) return [];
      return [{ id: doc.id, displayName, username: username || null, avatarUrl: profile.avatarUrl ?? profile.photoURL ?? account.avatarUrl ?? null, emailHint: emailHint(email) }];
    }).slice(0, 8);
    return ok({ recipients }, recipients.length ? "Recipients found." : "No available recipients matched your search.");
  } catch (error) {
    return serverError("Recipients could not be searched.", error instanceof Error ? error.message : error);
  }
}
