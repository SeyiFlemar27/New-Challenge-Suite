export const CHALLENGE_PAGE_SIZE = 36;

export type PaginationToken = number | "ellipsis";

export function paginationTokens(page: number, totalPages: number): PaginationToken[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const visible = new Set([1, totalPages, page - 1, page, page + 1].filter((value) => value >= 1 && value <= totalPages));
  const sorted = [...visible].sort((a, b) => a - b);
  const tokens: PaginationToken[] = [];
  sorted.forEach((value, index) => {
    if (index && value - sorted[index - 1] > 1) tokens.push("ellipsis");
    tokens.push(value);
  });
  return tokens;
}

export function totalChallengePages(total: number, pageSize = CHALLENGE_PAGE_SIZE) {
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}
