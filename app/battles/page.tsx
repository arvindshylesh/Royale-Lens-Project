import { headers } from "next/headers";
import { getSessionAccount, publicAccount } from "@/lib/auth";
import BattlesClient from "./battles-client";

export const dynamic = "force-dynamic";

export default async function BattlesPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>;
}) {
  const params = await searchParams;
  let account = null;

  try {
    const requestHeaders = await headers();
    const request = new Request("https://royale-lens.local/battles", {
      headers: new Headers(requestHeaders),
    });
    const sessionAccount = await getSessionAccount(request);
    account = sessionAccount ? publicAccount(sessionAccount) : null;
  } catch (error) {
    console.error("Battles session lookup error", error);
  }

  const requestedTag = params.tag?.trim().toUpperCase() || account?.defaultPlayerTag || "";
  return <BattlesClient initialTag={requestedTag} account={account} />;
}
