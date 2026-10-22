import { env } from "cloudflare:workers";
import { getD1Database } from "@/db";

export const SESSION_COOKIE = "royale_lens_session";
const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 30;

type Account = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  defaultPlayerTag: string | null;
  onboardingDismissed: boolean;
};

type GoogleIdentity = {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
};

function parseCookies(request: Request) {
  const cookies = new Map<string, string>();
  for (const entry of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0) continue;
    cookies.set(entry.slice(0, separator).trim(), decodeURIComponent(entry.slice(separator + 1).trim()));
  }
  return cookies;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function accountFromRow(row: {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  defaultPlayerTag: string | null;
  onboardingDismissed: number | boolean;
}): Account {
  return {
    ...row,
    onboardingDismissed: Boolean(row.onboardingDismissed),
  };
}

export async function getSessionAccount(request: Request): Promise<Account | null> {
  const token = parseCookies(request).get(SESSION_COOKIE);
  if (!token) return null;

  const tokenHash = await sha256(token);
  const database = getD1Database();
  const row = await database
    .prepare(
      `SELECT a.id, a.email, a.name, a.avatar_url AS avatarUrl,
              a.default_player_tag AS defaultPlayerTag,
              a.onboarding_dismissed AS onboardingDismissed,
              s.expires_at AS expiresAt
       FROM auth_sessions s
       JOIN accounts a ON a.id = s.account_id
       WHERE s.token_hash = ?`,
    )
    .bind(tokenHash)
    .first<Account & { expiresAt: number }>();

  if (!row) return null;
  if (row.expiresAt <= Date.now()) {
    await database.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }

  return accountFromRow(row);
}

export async function verifyGoogleCredential(credential: string): Promise<GoogleIdentity> {
  const clientId = env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("Google sign-in is not configured.");
  if (!credential || credential.length > 8192) throw new Error("The Google sign-in response is invalid.");

  // Validate Google's signed identity response on the server; the browser's
  // callback alone is never treated as proof of identity.
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok) throw new Error("Google could not verify this sign-in.");

  const payload = (await response.json()) as {
    aud?: string;
    sub?: string;
    email?: string;
    email_verified?: string;
    name?: string;
    picture?: string;
    iss?: string;
    exp?: string;
  };
  const issuerIsGoogle = payload.iss === "accounts.google.com" || payload.iss === "https://accounts.google.com";
  const expiration = Number(payload.exp ?? 0) * 1000;
  if (
    payload.aud !== clientId ||
    !issuerIsGoogle ||
    payload.email_verified !== "true" ||
    !payload.sub ||
    !payload.email ||
    expiration <= Date.now()
  ) {
    throw new Error("The Google sign-in response could not be trusted.");
  }

  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    name: payload.name?.trim() || payload.email.split("@")[0],
    picture: payload.picture ?? null,
  };
}

export async function createAccountSession(identity: GoogleIdentity) {
  const database = getD1Database();
  const accountId = `google:${identity.sub}`;
  const token = randomToken();
  // Only the hash is stored. A database leak cannot be used as a live cookie.
  const tokenHash = await sha256(token);
  const expiresAt = Date.now() + SESSION_LIFETIME_SECONDS * 1000;

  await database.batch([
    database
      .prepare(
        `INSERT INTO accounts (id, email, name, avatar_url, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
           email = excluded.email,
           name = excluded.name,
           avatar_url = excluded.avatar_url,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(accountId, identity.email, identity.name, identity.picture),
    database.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").bind(Date.now()),
    database
      .prepare(
        `INSERT INTO auth_sessions (token_hash, account_id, expires_at)
         VALUES (?, ?, ?)`,
      )
      .bind(tokenHash, accountId, expiresAt),
  ]);

  const account = await database
    .prepare(
      `SELECT id, email, name, avatar_url AS avatarUrl,
              default_player_tag AS defaultPlayerTag,
              onboarding_dismissed AS onboardingDismissed
       FROM accounts WHERE id = ?`,
    )
    .bind(accountId)
    .first<Parameters<typeof accountFromRow>[0]>();

  if (!account) throw new Error("Your Royale Lens account could not be created.");
  return { account: accountFromRow(account), token, maxAge: SESSION_LIFETIME_SECONDS };
}

export async function deleteSession(request: Request) {
  const token = parseCookies(request).get(SESSION_COOKIE);
  if (!token) return;
  const tokenHash = await sha256(token);
  await getD1Database().prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(tokenHash).run();
}

export function publicAccount(account: Account) {
  // Keep server-only identifiers and the account email out of client payloads.
  return {
    name: account.name,
    avatarUrl: account.avatarUrl,
    defaultPlayerTag: account.defaultPlayerTag,
    onboardingDismissed: account.onboardingDismissed,
  };
}

export function normalizePlayerTag(value: string) {
  const upper = value.trim().toUpperCase();
  return upper.startsWith("#") ? upper : `#${upper}`;
}

export function isValidPlayerTag(value: string) {
  return /^#[0289PYLQGRJCUV]{3,15}$/.test(normalizePlayerTag(value));
}
