import { getD1Database } from "@/db";
import { getSessionAccount } from "@/lib/auth";
import { queueLimits, queueRarities, type QueueRarity as Rarity } from "@/lib/queue-order";

type QueueItem = { cardId: number; rarity: Rarity; position: number };

function isRarity(value: unknown): value is Rarity {
  return typeof value === "string" && queueRarities.includes(value as Rarity);
}

function storageError(error: unknown) {
  console.error("Upgrade Queue storage error", error);
  return Response.json(
    { message: "Your Upgrade Queue is temporarily unavailable. Please try again." },
    { status: 503 },
  );
}

async function requireQueueAccount(request: Request) {
  const account = await getSessionAccount(request);
  if (!account) return { error: Response.json({ message: "Sign in to use your Upgrade Queue." }, { status: 401 }) } as const;
  if (!account.defaultPlayerTag) {
    return { error: Response.json({ message: "Add a default player tag to use your Upgrade Queue." }, { status: 403 }) } as const;
  }
  return { account } as const;
}

export async function GET(request: Request) {
  try {
    const authorization = await requireQueueAccount(request);
    if ("error" in authorization) return authorization.error;

    const database = getD1Database();
    const itemsResult = await database
      .prepare(
        `SELECT card_id AS cardId, rarity, position
         FROM account_upgrade_queue_items
         WHERE account_id = ?
         ORDER BY rarity ASC, position ASC`,
      )
      .bind(authorization.account.id)
      .all<QueueItem>();

    return Response.json({ items: itemsResult.results });
  } catch (error) {
    return storageError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const authorization = await requireQueueAccount(request);
    if ("error" in authorization) return authorization.error;
    const payload = (await request.json()) as {
      items?: Array<{ cardId?: unknown; rarity?: unknown }>;
    };
    if (!Array.isArray(payload.items)) {
      return Response.json({ message: "The queue update is incomplete." }, { status: 400 });
    }

    const uniqueCardIds = new Set<number>();
    const itemsByRarity: Record<Rarity, number[]> = {
      Common: [], Rare: [], Epic: [], Legendary: [], Champion: [],
    };
    for (const item of payload.items) {
      const cardId = Number(item.cardId);
      if (!Number.isInteger(cardId) || cardId <= 0 || !isRarity(item.rarity) || uniqueCardIds.has(cardId)) {
        return Response.json({ message: "The queue contains an invalid card." }, { status: 400 });
      }
      uniqueCardIds.add(cardId);
      itemsByRarity[item.rarity].push(cardId);
    }

    const normalizedItems: QueueItem[] = [];
    for (const rarity of queueRarities) {
      if (itemsByRarity[rarity].length > queueLimits[rarity]) {
        return Response.json({ message: `The ${rarity} queue is full.` }, { status: 400 });
      }
      itemsByRarity[rarity].forEach((cardId, position) => normalizedItems.push({ cardId, rarity, position }));
    }

    const database = getD1Database();
    // Replace the account snapshot atomically so every position remains
    // contiguous even when several cards move during one drag operation.
    const statements: D1PreparedStatement[] = [
      database.prepare("DELETE FROM account_upgrade_queue_items WHERE account_id = ?").bind(authorization.account.id),
    ];
    for (const item of normalizedItems) {
      statements.push(
        database
          .prepare(
            `INSERT INTO account_upgrade_queue_items
             (account_id, card_id, rarity, position, updated_at)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          )
          .bind(authorization.account.id, item.cardId, item.rarity, item.position),
      );
    }
    await database.batch(statements);
    return Response.json({ items: normalizedItems });
  } catch (error) {
    return storageError(error);
  }
}
