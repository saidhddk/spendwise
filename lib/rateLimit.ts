// NFR-16: at most 60 requests per minute per logged-in user on the transaction, category,
// dashboard and export endpoints. Sliding window kept in memory (one server process).

const WINDOW_MS = 60_000;
const LIMIT = 60;
const hits = new Map<string, number[]>();

export function allowRequest(userId: string, now = Date.now()): boolean {
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    hits.set(userId, recent);
    return false;
  }
  recent.push(now);
  hits.set(userId, recent);
  return true;
}

export function resetRateLimits(): void {
  hits.clear();
}
