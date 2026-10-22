import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    avatarUrl: text("avatar_url"),
    defaultPlayerTag: text("default_player_tag"),
    onboardingDismissed: integer("onboarding_dismissed", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("idx_accounts_email").on(table.email)],
);

// Sessions contain hashed bearer tokens and are removed with their account.
export const authSessions = sqliteTable(
  "auth_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_auth_sessions_account_id").on(table.accountId),
    index("idx_auth_sessions_expires_at").on(table.expiresAt),
  ],
);

// Queue positions are scoped to an account and a card may appear only once.
export const accountUpgradeQueueItems = sqliteTable(
  "account_upgrade_queue_items",
  {
    accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    cardId: integer("card_id").notNull(),
    rarity: text("rarity").notNull(),
    position: integer("position").notNull(),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.cardId] }),
    uniqueIndex("idx_account_queue_account_rarity_position").on(
      table.accountId,
      table.rarity,
      table.position,
    ),
  ],
);

// Bookmarks preserve each account's chosen ordering independently.
export const accountBookmarkedPlayers = sqliteTable(
  "account_bookmarked_players",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    playerTag: text("player_tag").notNull(),
    playerName: text("player_name").notNull(),
    position: integer("position").notNull().default(0),
    addedAt: text("added_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_account_bookmarks_account_tag").on(table.accountId, table.playerTag),
    index("idx_account_bookmarks_account_id").on(table.accountId, table.id),
  ],
);

// Guest limits store a hashed network fingerprint, never a raw address.
export const guestRateLimits = sqliteTable("guest_rate_limits", {
  clientHash: text("client_hash").primaryKey(),
  windowStartedAt: integer("window_started_at").notNull(),
  requestCount: integer("request_count").notNull(),
});

// Best trophies are monotonic observations because the live API can drop later.
export const playerTrophyBests = sqliteTable("player_trophy_bests", {
  playerTag: text("player_tag").primaryKey(),
  bestTrophies: integer("best_trophies").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
