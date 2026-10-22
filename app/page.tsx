import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { getSessionAccount, publicAccount } from "@/lib/auth";
import RoyaleLensClient from "./royale-lens-client";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string; section?: string }>;
}) {
  let account = null;
  const params = await searchParams;

  try {
    const requestHeaders = await headers();
    const request = new Request("https://royale-lens.local/", {
      headers: new Headers(requestHeaders),
    });
    const sessionAccount = await getSessionAccount(request);
    account = sessionAccount ? publicAccount(sessionAccount) : null;
  } catch (error) {
    console.error("Initial session lookup error", error);
  }

  const requestedPlayerTag = params.tag?.trim().toUpperCase() || null;
  const initialPlayerTag = requestedPlayerTag ?? account?.defaultPlayerTag ?? null;
  const initialSection = params.section === "upgrade-queue" || params.section === "collection"
    ? params.section
    : params.section === "overview"
      ? "overview"
      : null;
  const initialProfileUrl = initialPlayerTag
    ? `/api/player?tag=${encodeURIComponent(initialPlayerTag)}`
    : null;

  return (
    <>
      {initialProfileUrl ? (
        // Start the API request before React hydrates. The client adopts this
        // promise, avoiding a second fetch and shortening the signed-in boot.
        <script
          id="royale-lens-profile-preload"
          dangerouslySetInnerHTML={{
            __html: `window.__royaleLensInitialProfileRequest=fetch(${JSON.stringify(initialProfileUrl)},{cache:"no-store"});`,
          }}
        />
      ) : null}
      <RoyaleLensClient
        initialAccount={account}
        initialGoogleClientId={env.GOOGLE_CLIENT_ID ?? null}
        initialPlayerTag={initialPlayerTag}
        initialSection={initialSection}
      />
    </>
  );
}
