export const queueRarities = ["Common", "Rare", "Epic", "Legendary", "Champion"] as const;
export type QueueRarity = (typeof queueRarities)[number];

export const queueLimits: Record<QueueRarity, number> = {
  Common: 5,
  Rare: 5,
  Epic: 5,
  Legendary: 5,
  Champion: 5,
};

type PositionedQueueItem = {
  cardId: number;
  rarity: string;
  position: number;
};

export function getQueueTargetIndex(
  pointerX: number,
  listLeft: number,
  cardWidth: number,
  gap: number,
  itemCount: number,
) {
  // Treat each card and its following gap as one horizontal drag slot.
  if (itemCount <= 0 || cardWidth <= 0) return -1;
  const slotWidth = cardWidth + Math.max(0, gap);
  const index = Math.round((pointerX - listLeft - cardWidth / 2) / slotWidth);
  return Math.max(0, Math.min(index, itemCount - 1));
}

export function reorderQueueItem<T extends PositionedQueueItem>(
  items: T[],
  rarity: string,
  cardId: number,
  targetIndex: number,
  rarityOrder: readonly string[],
) {
  // Rebuild every lane in the canonical rarity order before persisting it.
  const laneItems = items
    .filter((item) => item.rarity === rarity)
    .sort((left, right) => left.position - right.position);
  const currentIndex = laneItems.findIndex((item) => item.cardId === cardId);
  const safeTargetIndex = Math.max(0, Math.min(targetIndex, laneItems.length - 1));
  if (currentIndex < 0 || currentIndex === safeTargetIndex) return normalizeQueueOrder(items, rarityOrder);

  const [movedItem] = laneItems.splice(currentIndex, 1);
  laneItems.splice(safeTargetIndex, 0, movedItem);

  const laneOrders = new Map<string, T[]>();
  for (const laneRarity of rarityOrder) {
    const orderedLane = laneRarity === rarity
      ? laneItems
      : items
          .filter((item) => item.rarity === laneRarity)
          .sort((left, right) => left.position - right.position);
    laneOrders.set(
      laneRarity,
      orderedLane.map((item, position) => ({ ...item, position })),
    );
  }

  return rarityOrder.flatMap((laneRarity) => laneOrders.get(laneRarity) ?? []);
}

export function normalizeQueueOrder<T extends PositionedQueueItem>(
  items: T[],
  rarityOrder: readonly string[],
) {
  return rarityOrder.flatMap((rarity) =>
    items
      .filter((item) => item.rarity === rarity)
      .sort((left, right) => left.position - right.position)
      .map((item, position) => ({ ...item, position })),
  );
}
