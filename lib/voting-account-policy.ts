export function votingAccountRestricted(account: Record<string, unknown>) {
  return account.disabled === true || account.suspended === true || account.votingRestricted === true
    || ["disabled", "suspended", "blocked", "deactivated", "deleted", "deletion_requested", "anonymized"].includes(String(account.accountStatus ?? "active"));
}
