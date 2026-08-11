import { NextResponse } from "next/server";

export function GET(request: Request) {
  const current = new URL(request.url);
  const plan = (current.searchParams.get("plan") ?? "").trim().toLowerCase();
  const reference = current.searchParams.get("session_id") ?? "";
  const destination = plan === "host"
    ? "/dashboard/host"
    : plan === "creator"
      ? "/creator"
      : ["pro", "premium", "enterprise"].includes(plan)
        ? "/dashboard"
        : "/subscriptions";
  const next = new URL(destination, current.origin);
  next.searchParams.set("checkout", plan ? "success" : "returned");
  next.searchParams.set("activation", "pending");
  if (/^cs_[A-Za-z0-9_]+$/.test(reference)) next.searchParams.set("session_id", reference);
  return NextResponse.redirect(next, 307);
}
