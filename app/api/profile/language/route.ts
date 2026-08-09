import { z } from "zod";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireRequestUser } from "@/lib/server/auth";
import { ok, readJson, serverUnavailable, validationError } from "@/lib/server/responses";

const schema = z.object({ language: z.enum(["en", "fr", "es", "pt"]) });

export async function PATCH(request: Request) {
  const { user, response } = await requireRequestUser(request);
  if (response) return response;
  const parsedBody = await readJson(request);
  if (parsedBody.response) return parsedBody.response;
  const parsed = schema.safeParse(parsedBody.body);
  if (!parsed.success) return validationError({ language: "Select a supported language." });
  const db = getAdminDb();
  if (!db) return serverUnavailable("Language preference");
  const updatedAt = new Date().toISOString();
  await Promise.all([
    db.collection("profiles").doc(user.uid).set({ language: parsed.data.language, updatedAt }, { merge: true }),
    db.collection("users").doc(user.uid).set({ language: parsed.data.language, updatedAt }, { merge: true })
  ]);
  return ok({ language: parsed.data.language }, "Language preference saved.");
}
