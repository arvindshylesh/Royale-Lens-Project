import { getD1Database } from "@/db";
import { getSessionAccount, isValidPlayerTag, normalizePlayerTag } from "@/lib/auth";
import { GOLD_PLAYER_TAG } from "@/lib/constants";

const MAX_BOOKMARKS = 25;

type BookmarkRow = {
  playerTag: string;
  playerName: string;
  position: number;
};

async function requireAccount(request: Request) {
  const account = await getSessionAccount(request);
  if (!account) {
    return {
      error: Response.json(
        { message: "Sign in to use Bookmarked Players." },
        { status: 401 },
      ),
    } as const;
  }
  return { account } as const;
}

function storageError(error: unknown) {
  console.error("Bookmarked Players storage error", error);
  return Response.json(
    { message: "Your bookmarked players are temporarily unavailable. Please try again." },
    { status: 503 },
  );
}

async function listBookmarks(database: D1Database, accountId: string) {
  const result = await database
    .prepare(
      `SELECT player_tag AS playerTag, player_name AS playerName,
              position
       FROM account_bookmarked_players
       WHERE account_id = ?
       ORDER BY CASE WHEN player_tag = ? THEN 0 ELSE 1 END ASC, position ASC, id ASC
       LIMIT ?`,
    )
    .bind(accountId, GOLD_PLAYER_TAG, MAX_BOOKMARKS)
    .all<BookmarkRow>();
  return result.results;
}

export async function GET(request: Request) {
  try {
    const authorization = await requireAccount(request);
    if ("error" in authorization) return authorization.error;

    const database = getD1Database();
    return Response.json({
      bookmarks: await listBookmarks(database, authorization.account.id),
      limit: MAX_BOOKMARKS,
    });
  } catch (error) {
    return storageError(error);
  }
}

export async function POST(request: Request) {
  try {
    const authorization = await requireAccount(request);
    if ("error" in authorization) return authorization.error;

    const payload = (await request.json()) as { playerTag?: unknown; playerName?: unknown };
    const playerTag = normalizePlayerTag(typeof payload.playerTag === "string" ? payload.playerTag : "");
    const playerName = typeof payload.playerName === "string" ? payload.playerName.trim() : "";
    if (!isValidPlayerTag(playerTag) || !playerName || playerName.length > 80) {
      return Response.json({ message: "That player cannot be bookmarked." }, { status: 400 });
    }

    const database = getD1Database();
    const existing = await database
      .prepare(
        `SELECT id FROM account_bookmarked_players
         WHERE account_id = ? AND player_tag = ?`,
      )
      .bind(authorization.account.id, playerTag)
      .first<{ id: number }>();

    if (existing) {
      await database
        .prepare(
          `UPDATE account_bookmarked_players
           SET player_name = ?
           WHERE account_id = ? AND player_tag = ?`,
        )
        .bind(playerName, authorization.account.id, playerTag)
        .run();
    } else {
      // The count check and insert happen in one statement so concurrent tabs
      // cannot exceed the account's bookmark limit.
      const insertResult = await database
        .prepare(
          `INSERT INTO account_bookmarked_players
           (account_id, player_tag, player_name, position)
           SELECT ?, ?, ?, COALESCE((
             SELECT MAX(position) + 1
             FROM account_bookmarked_players
             WHERE account_id = ?
           ), 0)
           WHERE (
             SELECT COUNT(*)
             FROM account_bookmarked_players
             WHERE account_id = ?
           ) < ?
           ON CONFLICT(account_id, player_tag) DO UPDATE SET
             player_name = excluded.player_name`,
        )
        .bind(
          authorization.account.id,
          playerTag,
          playerName,
          authorization.account.id,
          authorization.account.id,
          MAX_BOOKMARKS,
        )
        .run();
      if ((insertResult.meta.changes ?? 0) === 0) {
        return Response.json(
          { message: `You can bookmark up to ${MAX_BOOKMARKS} players.` },
          { status: 409 },
        );
      }
    }

    return Response.json({
      bookmarks: await listBookmarks(database, authorization.account.id),
      limit: MAX_BOOKMARKS,
    });
  } catch (error) {
    return storageError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const authorization = await requireAccount(request);
    if ("error" in authorization) return authorization.error;

    const payload = (await request.json()) as { playerTags?: unknown };
    if (!Array.isArray(payload.playerTags) || payload.playerTags.length > MAX_BOOKMARKS) {
      return Response.json({ message: "That bookmark order is invalid." }, { status: 400 });
    }

    const requestedTags = payload.playerTags.map((value) =>
      normalizePlayerTag(typeof value === "string" ? value : ""),
    );
    if (
      requestedTags.some((tag) => !isValidPlayerTag(tag)) ||
      new Set(requestedTags).size !== requestedTags.length
    ) {
      return Response.json({ message: "That bookmark order is invalid." }, { status: 400 });
    }

    const database = getD1Database();
    const existing = await database
      .prepare(
        `SELECT player_tag AS playerTag
         FROM account_bookmarked_players
         WHERE account_id = ?`,
      )
      .bind(authorization.account.id)
      .all<{ playerTag: string }>();
    const existingTags = new Set(existing.results.map((bookmark) => bookmark.playerTag));
    // Reordering may change positions only; it may not add or remove records.
    if (
      existingTags.size !== requestedTags.length ||
      requestedTags.some((tag) => !existingTags.has(tag))
    ) {
      return Response.json({ message: "Your bookmarks changed. Please try reordering again." }, { status: 409 });
    }

    // The personal profile is pinned only when this account has bookmarked it.
    const orderedTags = requestedTags.includes(GOLD_PLAYER_TAG)
      ? [GOLD_PLAYER_TAG, ...requestedTags.filter((tag) => tag !== GOLD_PLAYER_TAG)]
      : requestedTags;
    if (orderedTags.length) {
      await database.batch(
        orderedTags.map((tag, position) =>
          database
            .prepare(
              `UPDATE account_bookmarked_players
               SET position = ?
               WHERE account_id = ? AND player_tag = ?`,
            )
            .bind(position, authorization.account.id, tag),
        ),
      );
    }

    return Response.json({
      bookmarks: await listBookmarks(database, authorization.account.id),
      limit: MAX_BOOKMARKS,
    });
  } catch (error) {
    return storageError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const authorization = await requireAccount(request);
    if ("error" in authorization) return authorization.error;

    const playerTag = normalizePlayerTag(new URL(request.url).searchParams.get("tag") ?? "");
    if (!isValidPlayerTag(playerTag)) {
      return Response.json({ message: "That bookmark is invalid." }, { status: 400 });
    }

    const database = getD1Database();
    await database
      .prepare(
        `DELETE FROM account_bookmarked_players
         WHERE account_id = ? AND player_tag = ?`,
      )
      .bind(authorization.account.id, playerTag)
      .run();

    return Response.json({
      bookmarks: await listBookmarks(database, authorization.account.id),
      limit: MAX_BOOKMARKS,
    });
  } catch (error) {
    return storageError(error);
  }
}
