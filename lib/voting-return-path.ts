/** Only competition locations, never an external redirect or an automatic action. */
export function safeVotingReturnPath(value: unknown) {
  if (typeof value !== "string" || value.length > 1000 || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  try {
    const url = new URL(value, "https://challenge-suite.invalid");
    if (!/^\/(?:challenges\/[^/]+(?:\/bonus-votes)?|tournaments\/[^/]+(?:\/matches\/[^/]+)?|private\/preview\/[^/]+)\/?$/.test(url.pathname)) return null;
    const result = new URL(url.pathname, url.origin);
    for (const field of ["submissionId", "voteTarget"]) {
      const parameter = url.searchParams.get(field);
      if (parameter && /^[a-zA-Z0-9_.:-]{1,300}$/.test(parameter)) result.searchParams.set(field, parameter);
    }
    return `${result.pathname}${result.search}`;
  } catch { return null; }
}
