import { env } from "cloudflare:workers";

export function getD1Database() {
  if (!env.DB) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  }

  return env.DB;
}
