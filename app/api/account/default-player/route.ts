import { getD1Database } from "@/db";
import { getSessionAccount, isValidPlayerTag, normalizePlayerTag, publicAccount } from "@/lib/auth";

export async function PUT(request: Request) {
  try {
    const account = await getSessionAccount(request);
    if (!account) return Response.json({ message: "Sign in to update your default player." }, { status: 401 });

    const body = (await request.json()) as { playerTag?: unknown };
    if (typeof body.playerTag !== "string" || !isValidPlayerTag(body.playerTag)) {
      return Response.json({ message: "Enter a valid Clash Royale player tag." }, { status: 400 });
    }
    const tag = normalizePlayerTag(body.playerTag);
    await getD1Database()
      .prepare(
        `UPDATE accounts
         SET default_player_tag = ?, onboarding_dismissed = 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(tag, account.id)
      .run();

    return Response.json({
      account: publicAccount({ ...account, defaultPlayerTag: tag, onboardingDismissed: true }),
    });
  } catch (error) {
    console.error("Default player update error", error);
    return Response.json({ message: "Your default player could not be saved. Please try again." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  try {
    const account = await getSessionAccount(request);
    if (!account) return Response.json({ message: "Sign in to update your account." }, { status: 401 });
    await getD1Database()
      .prepare(
        `UPDATE accounts
         SET onboarding_dismissed = 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(account.id)
      .run();
    return Response.json({
      account: publicAccount({ ...account, onboardingDismissed: true }),
    });
  } catch (error) {
    console.error("Onboarding preference update error", error);
    return Response.json({ message: "Your preference could not be saved." }, { status: 503 });
  }
}
