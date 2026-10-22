import { getD1Database } from "@/db";

const WINDOW_MS = 60 * 60 * 1000;
const GUEST_REQUEST_LIMIT = 30;

async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function checkGuestPlayerRateLimit(request: Request) {
  const address = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  // Store a one-way fingerprint instead of retaining the visitor's raw IP.
  const clientHash = await hash(`royale-lens:${address}`);
  const now = Date.now();
  const database = getD1Database();
  const current = await database
    .prepare(
      `SELECT window_started_at AS windowStartedAt, request_count AS requestCount
       FROM guest_rate_limits WHERE client_hash = ?`,
    )
    .bind(clientHash)
    .first<{ windowStartedAt: number; requestCount: number }>();

  if (!current || now - current.windowStartedAt >= WINDOW_MS) {
    await database
      .prepare(
        `INSERT INTO guest_rate_limits (client_hash, window_started_at, request_count)
         VALUES (?, ?, 1)
         ON CONFLICT(client_hash) DO UPDATE SET
           window_started_at = excluded.window_started_at,
           request_count = 1`,
      )
      .bind(clientHash, now)
      .run();
    return { allowed: true, remaining: GUEST_REQUEST_LIMIT - 1 };
  }

  if (current.requestCount >= GUEST_REQUEST_LIMIT) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((WINDOW_MS - (now - current.windowStartedAt)) / 1000)),
    };
  }

  await database
    .prepare("UPDATE guest_rate_limits SET request_count = request_count + 1 WHERE client_hash = ?")
    .bind(clientHash)
    .run();
  return { allowed: true, remaining: GUEST_REQUEST_LIMIT - current.requestCount - 1 };
}
