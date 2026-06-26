import { createHash } from "crypto";

const HASH_SECRET = process.env.VOTE_SIGNAL_HASH_SECRET ?? process.env.OTP_HASH_SECRET ?? "challenge-suite-local-vote-signal";

function hashValue(value: string | null) {
  if (!value) return null;
  return createHash("sha256").update(`${HASH_SECRET}:${value}`).digest("hex");
}

export function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || request.headers.get("cf-connecting-ip") || null;
}

export function voteSignalHashes(request: Request) {
  return {
    ipHash: hashValue(getClientIp(request)),
    userAgentHash: hashValue(request.headers.get("user-agent"))
  };
}

export function suspiciousVoteSignals(input: { quantity: number; voteMode: string }) {
  const signals: string[] = [];
  if (input.quantity >= 25) signals.push("high_quantity_vote_batch");
  if (input.voteMode === "free" && input.quantity > 1) signals.push("free_vote_quantity_over_one");
  return signals;
}
