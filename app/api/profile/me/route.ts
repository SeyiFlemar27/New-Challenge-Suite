import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { ensureWallet } from "@/lib/server/dorocoin";
import { ok, readJson, serverError, serverUnavailable, validationError } from "@/lib/server/responses";
import { z } from "zod";

export const dynamic = "force-dynamic";

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return null;
}

function initialsFromName(name: string) {
  return name
    .split(" ")
    .map((part) => part.trim()[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(2, "Display name must be at least 2 characters.").max(80, "Display name must be 80 characters or fewer."),
  selfDeclaredRegion: z.enum(["US", "NG"], { message: "Select United States or Nigeria." })
});

export async function GET(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;

  const db = getAdminDb();
  if (!db) return serverUnavailable("Profile");

  try {
    const walletRef = await ensureWallet(db, user.uid);
    const [accountSnap, profileSnap, walletSnap, submissionsSnap, badgesSnap] = await Promise.all([
      db.collection("users").doc(user.uid).get(),
      db.collection("profiles").doc(user.uid).get(),
      walletRef.get(),
      db.collection("submissions").where("userId", "==", user.uid).orderBy("createdAt", "desc").limit(50).get(),
      db.collection("badges").where("userId", "==", user.uid).limit(50).get()
    ]);

    const account = accountSnap.exists ? accountSnap.data() ?? {} : {};
    const profile = profileSnap.exists ? profileSnap.data() ?? {} : {};
    const wallet = walletSnap.data() ?? {};
    const displayName = String(profile.displayName ?? account.displayName ?? user.email ?? "");
    const submissions: Array<Record<string, unknown>> = submissionsSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        createdAt: toIso(data.createdAt),
        submittedAt: toIso(data.submittedAt)
      };
    });
    const badges = badgesSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        earnedAt: toIso(data.earnedAt ?? data.createdAt)
      };
    });
    const totalLikes = submissions.reduce((sum, submission) => sum + Number(submission.likes ?? submission.voteCount ?? submission.weightedVoteCount ?? 0), 0);

    return ok({
      profileExists: profileSnap.exists,
      user: {
        uid: user.uid,
        email: user.email ?? profile.email ?? account.email ?? "",
        displayName,
        username: profile.username ?? profile.handle ?? account.username ?? null,
        initials: profile.initials ?? initialsFromName(displayName || String(user.email ?? "")),
        avatarUrl: profile.avatarUrl ?? profile.photoURL ?? account.avatarUrl ?? null,
        role: account.role ?? profile.role ?? null,
        planId: account.planId ?? profile.planId ?? "observer",
        selfDeclaredRegion: profile.selfDeclaredRegion ?? account.selfDeclaredRegion ?? null,
        verified: Boolean(profile.verified ?? user.emailVerified),
        premium: Boolean(profile.premium || (account.planId && account.planId !== "observer")),
        joinedAt: toIso(profile.createdAt ?? account.createdAt),
        doroBalance: Number(wallet.balance ?? 0)
      },
      stats: {
        totalPoints: Number(profile.totalPoints ?? account.totalPoints ?? 0),
        submissions: submissions.length,
        totalLikes: Number(profile.totalLikes ?? totalLikes),
        followers: Number(profile.followers ?? 0),
        following: Number(profile.following ?? 0)
      },
      badges,
      submissions
    }, "Profile loaded.");
  } catch (error) {
    return serverError("Profile could not be loaded.", error instanceof Error ? error.message : error);
  }
}

export async function PATCH(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;

  const db = getAdminDb();
  if (!db) return serverUnavailable("Profile updates");

  const parsedBody = await readJson(request);
  if (parsedBody.response) return parsedBody.response;

  const parsed = profileUpdateSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "profile");
      fieldErrors[field] = issue.message;
    }
    return validationError(fieldErrors);
  }

  try {
    const now = new Date().toISOString();
    const initials = initialsFromName(parsed.data.displayName);
    await Promise.all([
      db.collection("profiles").doc(user.uid).set({
        uid: user.uid,
        email: user.email ?? "",
        displayName: parsed.data.displayName,
        initials,
        selfDeclaredRegion: parsed.data.selfDeclaredRegion,
        verified: user.emailVerified,
        updatedAt: now
      }, { merge: true }),
      db.collection("users").doc(user.uid).set({
        uid: user.uid,
        email: user.email ?? "",
        displayName: parsed.data.displayName,
        selfDeclaredRegion: parsed.data.selfDeclaredRegion,
        emailVerified: user.emailVerified,
        updatedAt: now
      }, { merge: true })
    ]);

    return ok({
      user: {
        uid: user.uid,
        email: user.email ?? "",
        displayName: parsed.data.displayName,
        initials,
        selfDeclaredRegion: parsed.data.selfDeclaredRegion
      }
    }, "Profile changes saved.");
  } catch (error) {
    return serverError("Profile could not be updated.", error instanceof Error ? error.message : error);
  }
}
