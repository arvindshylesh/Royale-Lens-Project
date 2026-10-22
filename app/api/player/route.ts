import { NextRequest, NextResponse } from "next/server";
import { env } from "cloudflare:workers";
import { getD1Database } from "@/db";
import { getSessionAccount, isValidPlayerTag, normalizePlayerTag } from "@/lib/auth";
import { checkGuestPlayerRateLimit } from "@/lib/rate-limit";

type ApiCard = {
  id: number;
  name: string;
  maxLevel: number;
  rarity: string;
  elixirCost?: number;
  count?: number;
  level?: number;
  evolutionLevel?: number;
  maxEvolutionLevel?: number;
  heroLevel?: number;
  maxHeroLevel?: number;
  heroUnlocked?: boolean;
  hasHero?: boolean;
  isTowerTroop?: boolean;
  type?: string;
  category?: string;
  iconUrls?: {
    medium?: string;
    evolutionMedium?: string;
    heroMedium?: string;
  };
};

type PathOfLegendSeasonResult = {
  leagueNumber?: number;
  trophies?: number;
  rank?: number;
};

type PlayerBadge = {
  name?: string;
  progress?: number;
};

type PlayerResponse = {
  tag: string;
  name: string;
  expLevel: number;
  kingTowerLevel?: number;
  collectionLevel?: number;
  trophies: number;
  bestTrophies: number;
  wins: number;
  losses?: number;
  battleCount: number;
  threeCrownWins?: number;
  totalDonations?: number;
  starPoints?: number;
  badges?: PlayerBadge[];
  arena?: { name?: string };
  clan?: { name?: string };
  role?: string;
  cards?: ApiCard[];
  supportCards?: ApiCard[];
  currentPathOfLegendSeasonResult?: PathOfLegendSeasonResult;
  lastPathOfLegendSeasonResult?: PathOfLegendSeasonResult;
  bestPathOfLegendSeasonResult?: PathOfLegendSeasonResult;
  progress?: Record<
    string,
    {
      trophies?: number;
      bestTrophies?: number;
    }
  >;
};

type CardsResponse = { items?: ApiCard[] };

type TrophyBattleParticipant = {
  tag?: string;
  startingTrophies?: number;
  trophyChange?: number;
};

type TrophyBattle = {
  team?: TrophyBattleParticipant[];
  opponent?: TrophyBattleParticipant[];
};

type CardCatalogResult =
  | { ok: true; catalog: CardsResponse }
  | { ok: false; status: number };

const CARD_CATALOG_LIFETIME_MS = 5 * 60 * 1000;
let cachedCardCatalog: { catalog: CardsResponse; expiresAt: number } | null = null;
let cardCatalogRequest: Promise<CardCatalogResult> | null = null;

const supportedRarities: Record<string, string> = {
  common: "Common",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
  champion: "Champion",
};

const knownTowerTroops = new Set([
  "tower princess",
  "cannoneer",
  "dagger duchess",
  "royal chef",
]);

// Official card-copy requirements for upgrading to each target level.
const cardCopiesByTargetLevel: Record<string, Record<number, number>> = {
  Common: { 2: 2, 3: 4, 4: 10, 5: 20, 6: 50, 7: 100, 8: 200, 9: 400, 10: 800, 11: 1000, 12: 1500, 13: 2500, 14: 3500, 15: 5500, 16: 7500 },
  Rare: { 4: 2, 5: 4, 6: 10, 7: 20, 8: 50, 9: 100, 10: 200, 11: 300, 12: 400, 13: 550, 14: 750, 15: 1000, 16: 1400 },
  Epic: { 7: 2, 8: 4, 9: 10, 10: 20, 11: 30, 12: 50, 13: 70, 14: 100, 15: 130, 16: 180 },
  Legendary: { 10: 2, 11: 4, 12: 6, 13: 9, 14: 12, 15: 14, 16: 20 },
  Champion: { 12: 2, 13: 5, 14: 8, 15: 11, 16: 15 },
};

const regularArenaThresholds = [
  0, 300, 600, 1000, 1300, 1600, 2000, 2300, 2600, 3000, 3400, 3800,
  4200, 4600, 5000, 5500, 6000, 6500, 7000, 7500, 8000, 8500, 9000,
  9500, 10000, 10500, 11000, 11500, 12000, 12500, 13000, 13500,
];

function arenaLabel(trophies: number) {
  if (trophies >= 14000) {
    const seasonalArena = Math.min(2, Math.floor((trophies - 14000) / 500) + 1);
    return `Seasonal Arena ${seasonalArena}`;
  }

  let arena = 1;
  regularArenaThresholds.forEach((threshold, index) => {
    if (trophies >= threshold) arena = index + 1;
  });
  return `Arena ${arena}`;
}

function clanRoleInitial(role: string | undefined) {
  const normalizedRole = (role ?? "").replace(/[\s_-]/g, "").toLowerCase();
  if (normalizedRole === "leader") return "L";
  if (normalizedRole === "coleader") return "C";
  if (normalizedRole === "elder") return "E";
  if (normalizedRole === "member") return "M";
  return null;
}

function optionalNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function rankedSeason(result: PathOfLegendSeasonResult | undefined) {
  if (!result) return null;

  return {
    leagueNumber: optionalNumber(result.leagueNumber),
    medals: optionalNumber(result.trophies),
    rank: optionalNumber(result.rank),
  };
}

function badgeProgress(badges: PlayerBadge[] | undefined, badgeName: string) {
  const normalizedBadgeName = badgeName.replace(/[\s_-]/g, "").toLowerCase();
  const badge = badges?.find(
    (item) => (item.name ?? "").replace(/[\s_-]/g, "").toLowerCase() === normalizedBadgeName,
  );
  return optionalNumber(badge?.progress);
}

function accountAgeDays(badges: PlayerBadge[] | undefined) {
  return badgeProgress(badges, "YearsPlayed");
}

function derivedKingTowerLevel(collection: Array<{ level: number | null; isTowerTroop: boolean }>) {
  const cardLevels = collection
    .filter((card) => !card.isTowerTroop && card.level !== null)
    .map((card) => card.level as number);
  const requirements = [
    { kingLevel: 2, cards: 9, cardLevel: 1 },
    { kingLevel: 3, cards: 9, cardLevel: 2 },
    { kingLevel: 4, cards: 10, cardLevel: 3 },
    { kingLevel: 5, cards: 10, cardLevel: 4 },
    { kingLevel: 6, cards: 10, cardLevel: 5 },
    { kingLevel: 7, cards: 10, cardLevel: 6 },
    { kingLevel: 8, cards: 10, cardLevel: 7 },
    { kingLevel: 9, cards: 10, cardLevel: 8 },
    { kingLevel: 10, cards: 10, cardLevel: 9 },
    { kingLevel: 11, cards: 10, cardLevel: 10 },
    { kingLevel: 12, cards: 11, cardLevel: 11 },
    { kingLevel: 13, cards: 11, cardLevel: 12 },
    { kingLevel: 14, cards: 12, cardLevel: 13 },
    { kingLevel: 15, cards: 13, cardLevel: 14 },
    { kingLevel: 16, cards: 14, cardLevel: 15 },
  ];

  return requirements.reduce(
    (level, requirement) => cardLevels.filter((cardLevel) => cardLevel >= requirement.cardLevel).length >= requirement.cards
      ? requirement.kingLevel
      : level,
    1,
  );
}

function seasonalTrophyProgress(player: PlayerResponse) {
  return Object.entries(player.progress ?? {})
    .filter(([key]) => key.startsWith("seasonal-trophy-road-"))
    .sort(([left], [right]) => right.localeCompare(left));
}

function seasonalTrophyValue(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;

  // Seasonal progress can be returned either as 0–1,000 progress or as an
  // already-combined 14,000–15,000 total, depending on the API field.
  const progress = value >= 14000 ? value - 14000 : value;
  return Math.min(1000, Math.max(0, progress));
}

function latestBattleSeasonalTrophies(battles: TrophyBattle[], playerTag: string) {
  const normalizedTag = playerTag.toUpperCase();

  for (const battle of battles) {
    const participant = [...(battle.team ?? []), ...(battle.opponent ?? [])]
      .find((item) => item.tag?.toUpperCase() === normalizedTag);
    if (
      typeof participant?.startingTrophies !== "number" ||
      typeof participant.trophyChange !== "number"
    ) continue;

    const updatedTrophies = participant.startingTrophies + participant.trophyChange;
    if (updatedTrophies >= 14000) return seasonalTrophyValue(updatedTrophies);
  }

  return 0;
}

function currentSeasonalTrophies(player: PlayerResponse, battles: TrophyBattle[]) {
  // Below the 14,000 Trophy Road ceiling, `player.trophies` is the player's
  // complete current total—not seasonal progress. Returning early prevents a
  // regular Trophy Road value from being clamped to 1,000 and added twice.
  if (player.trophies < 14000) return 0;

  const latestSeasonalProgress = seasonalTrophyProgress(player)[0]?.[1];
  return Math.max(
    seasonalTrophyValue(latestSeasonalProgress?.trophies),
    seasonalTrophyValue(player.trophies),
    latestBattleSeasonalTrophies(battles, player.tag),
  );
}

function combinedBestTrophies(player: PlayerResponse, currentTrophies: number) {
  // Seasonal progress is relevant only after the player reaches the 14,000
  // Trophy Road ceiling. Older zero-valued seasonal records must not create a
  // synthetic 14,000 best for players who are still below that boundary.
  if (player.trophies < 14000) {
    return Math.min(15000, Math.max(player.bestTrophies, currentTrophies));
  }

  const seasonalTotals = seasonalTrophyProgress(player)
    .flatMap(([, progress]) => [progress.trophies, progress.bestTrophies])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .map((value) => 14000 + seasonalTrophyValue(value));

  return Math.min(15000, Math.max(player.bestTrophies, currentTrophies, ...seasonalTotals));
}

function highestRecentBattleTrophies(battles: TrophyBattle[], playerTag: string) {
  const normalizedTag = playerTag.toUpperCase();

  return battles.reduce((highest, battle) => {
    const participant = [...(battle.team ?? []), ...(battle.opponent ?? [])]
      .find((item) => item.tag?.toUpperCase() === normalizedTag);
    if (
      typeof participant?.startingTrophies !== "number" ||
      typeof participant.trophyChange !== "number"
    ) return highest;

    const updatedTrophies = participant.startingTrophies + participant.trophyChange;
    return updatedTrophies > 0 ? Math.max(highest, updatedTrophies) : highest;
  }, 0);
}

async function persistBestTrophies(playerTag: string, candidate: number) {
  const safeCandidate = Math.min(15000, Math.max(0, Math.floor(candidate)));

  try {
    const stored = await getD1Database()
      .prepare(
        `INSERT INTO player_trophy_bests (player_tag, best_trophies, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(player_tag) DO UPDATE SET
           best_trophies = MAX(player_trophy_bests.best_trophies, excluded.best_trophies),
           updated_at = CASE
             WHEN excluded.best_trophies > player_trophy_bests.best_trophies THEN CURRENT_TIMESTAMP
             ELSE player_trophy_bests.updated_at
           END
         RETURNING best_trophies AS bestTrophies`,
      )
      .bind(playerTag.toUpperCase(), safeCandidate)
      .first<{ bestTrophies: number }>();

    return stored?.bestTrophies ?? safeCandidate;
  } catch (error) {
    // Profile loading should remain available if persistent history is
    // temporarily unavailable. The next successful sync will retry the upsert.
    console.error("Best trophies storage error", error);
    return safeCandidate;
  }
}

function errorMessage(status: number) {
  if (status === 404) return "We could not find that player tag. Check it and try again.";
  if (status === 403) return "The Clash Royale API key is not allowed from this server yet.";
  if (status === 429) return "The Clash Royale API is busy. Please wait a moment and try again.";
  return "Clash Royale did not return the player data. Please try again shortly.";
}

async function getCardCatalog(apiBase: string, headers: Record<string, string>): Promise<CardCatalogResult> {
  if (cachedCardCatalog && cachedCardCatalog.expiresAt > Date.now()) {
    return { ok: true, catalog: cachedCardCatalog.catalog };
  }

  // Reuse one in-flight catalog request so simultaneous profile loads do not
  // create duplicate calls to the global cards endpoint.
  if (!cardCatalogRequest) {
    cardCatalogRequest = (async (): Promise<CardCatalogResult> => {
      const response = await fetch(`${apiBase}/v1/cards`, { headers, cache: "no-store" });
      if (!response.ok) return { ok: false, status: response.status };

      const catalog = (await response.json()) as CardsResponse;
      cachedCardCatalog = {
        catalog,
        expiresAt: Date.now() + CARD_CATALOG_LIFETIME_MS,
      };
      return { ok: true, catalog };
    })().finally(() => {
      cardCatalogRequest = null;
    });
  }

  return cardCatalogRequest!;
}

export async function GET(request: NextRequest) {
  const token = env.CLASH_ROYALE_API_TOKEN;
  const apiBase = (env.CLASH_ROYALE_API_BASE || "https://api.clashroyale.com").replace(/\/$/, "");
  const rawTag = request.nextUrl.searchParams.get("tag") ?? "";

  if (!rawTag.trim()) {
    return NextResponse.json({ message: "Enter a Clash Royale player tag." }, { status: 400 });
  }

  if (!isValidPlayerTag(rawTag)) {
    return NextResponse.json({ message: "That player tag does not look valid." }, { status: 400 });
  }

  if (!token) {
    return NextResponse.json(
      { message: "The secure API connection is not configured yet. We will add it in the next setup step." },
      { status: 503 },
    );
  }

  const tag = normalizePlayerTag(rawTag);
  const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };

  try {
    const account = await getSessionAccount(request);
    if (!account) {
      const rateLimit = await checkGuestPlayerRateLimit(request);
      if (!rateLimit.allowed) {
        return NextResponse.json(
          { message: "Guest lookup limit reached. Please sign in or try again later." },
          { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter ?? 3600) } },
        );
      }
    }

    const [playerResult, battlesResult, catalogResult] = await Promise.all([
      fetch(`${apiBase}/v1/players/${encodeURIComponent(tag)}`, { headers, cache: "no-store" }),
      fetch(`${apiBase}/v1/players/${encodeURIComponent(tag)}/battlelog`, { headers, cache: "no-store" }),
      getCardCatalog(apiBase, headers),
    ]);

    if (!playerResult.ok) {
      return NextResponse.json({ message: errorMessage(playerResult.status) }, { status: playerResult.status });
    }
    if (!catalogResult.ok) {
      return NextResponse.json({ message: errorMessage(catalogResult.status) }, { status: catalogResult.status });
    }

    const player = (await playerResult.json()) as PlayerResponse;
    const battles = battlesResult.ok ? (await battlesResult.json()) as TrophyBattle[] : [];
    const cardCatalog = catalogResult.catalog;
    const playerCards = player.cards ?? [];
    const towerTroops = (player.supportCards ?? []).map((card) => ({
      ...card,
      isTowerTroop: true,
    }));
    const owned = new Map([...playerCards, ...towerTroops].map((card) => [card.id, card]));
    const catalogById = new Map(
      (cardCatalog.items ?? []).map((card) => [card.id, card]),
    );

    // The official API exposes Tower Troops under player.supportCards instead
    // of player.cards. Merge them into the normal catalog so the collection UI
    // can display and sort both card types through one consistent model.
    towerTroops.forEach((towerTroop) => {
      const catalogCard = catalogById.get(towerTroop.id);
      catalogById.set(towerTroop.id, {
        ...catalogCard,
        ...towerTroop,
        iconUrls: {
          ...catalogCard?.iconUrls,
          ...towerTroop.iconUrls,
        },
        isTowerTroop: true,
      });
    });

    const allCards = Array.from(catalogById.values());
    const globalMaxLevel = Math.max(1, ...allCards.map((card) => card.maxLevel));
    const heroOwnershipAvailable =
      allCards.some((card) => Boolean(card.iconUrls?.heroMedium)) ||
      playerCards.some((card) => Boolean(card.iconUrls?.heroMedium));
    const trophyRoadTrophies = Math.min(player.trophies, 14000);
    const seasonalTrophies = currentSeasonalTrophies(player, battles);
    const totalTrophies = trophyRoadTrophies + seasonalTrophies;
    const observedBestTrophies = Math.max(
      combinedBestTrophies(player, totalTrophies),
      highestRecentBattleTrophies(battles, player.tag),
    );
    const bestTrophies = await persistBestTrophies(player.tag, observedBestTrophies);

    const collection = allCards.map((catalogCard) => {
      const playerCard = owned.get(catalogCard.id);
      const rarity = supportedRarities[catalogCard.rarity.toLowerCase()] ?? "Common";
      const displayLevel = playerCard?.level
        ? playerCard.level + (globalMaxLevel - catalogCard.maxLevel)
        : null;
      const copiesNeeded = displayLevel && displayLevel < globalMaxLevel
        ? cardCopiesByTargetLevel[rarity]?.[displayLevel + 1] ?? null
        : null;
      // Clash Royale stores special forms as a bit mask: Evolution = 1, Hero = 2.
      // A value of 3 means that the card supports (or owns) both forms.
      const availableForms = catalogCard.maxEvolutionLevel ?? playerCard?.maxEvolutionLevel ?? 0;
      const unlockedForms = playerCard?.evolutionLevel ?? 0;
      const hasEvolution = Boolean(catalogCard.iconUrls?.evolutionMedium || (availableForms & 1));
      const evolutionUnlocked = Boolean(unlockedForms & 1);
      const hasHero = Boolean(
        catalogCard.iconUrls?.heroMedium ||
        playerCard?.iconUrls?.heroMedium ||
        catalogCard.hasHero ||
        (catalogCard.maxHeroLevel ?? playerCard?.maxHeroLevel ?? 0) > 0 ||
        (availableForms & 2),
      );
      const heroUnlocked = hasHero
        ? Boolean((unlockedForms & 2) || playerCard?.heroUnlocked || (playerCard?.heroLevel ?? 0) > 0)
        : false;
      const cardCategory = `${catalogCard.type ?? ""} ${catalogCard.category ?? ""}`.toLowerCase();
      const isTowerTroop = Boolean(
        catalogCard.isTowerTroop ||
        playerCard?.isTowerTroop ||
        /tower[\s_-]*troop/.test(cardCategory) ||
        knownTowerTroops.has(catalogCard.name.toLowerCase()),
      );
      return {
        id: catalogCard.id,
        name: catalogCard.name,
        rarity,
        elixirCost: catalogCard.elixirCost ?? null,
        level: displayLevel,
        maxLevel: globalMaxLevel,
        count: playerCard?.count ?? 0,
        copiesNeeded,
        unlocked: Boolean(playerCard),
        iconUrl: catalogCard.iconUrls?.medium ?? playerCard?.iconUrls?.medium ?? null,
        evolutionIconUrl: catalogCard.iconUrls?.evolutionMedium ?? playerCard?.iconUrls?.evolutionMedium ?? null,
        heroIconUrl: catalogCard.iconUrls?.heroMedium ?? playerCard?.iconUrls?.heroMedium ?? null,
        hasEvolution,
        evolutionUnlocked,
        hasHero,
        heroUnlocked,
        isTowerTroop,
      };
    });

    const derivedCollectionLevel = collection.reduce(
      (total, card) => total + (card.level ?? 0),
      0,
    ) + 5 * collection.filter((card) => card.evolutionUnlocked).length
      + 5 * collection.filter((card) => card.heroUnlocked).length;
    const collectionLevel = player.collectionLevel && player.collectionLevel > 0
      ? player.collectionLevel
      : derivedCollectionLevel;
    const kingTowerLevel = player.kingTowerLevel && player.kingTowerLevel > 0
      ? player.kingTowerLevel
      : derivedKingTowerLevel(collection);

    return NextResponse.json(
      {
        syncedAt: new Date().toISOString(),
        player: {
          tag: player.tag,
          name: player.name,
          expLevel: player.expLevel,
          kingTowerLevel,
          collectionLevel,
          trophies: totalTrophies,
          trophyRoadTrophies,
          maxTrophies: 15000,
          bestTrophies,
          arena: player.arena?.name ?? "Unknown arena",
          arenaLabel: arenaLabel(totalTrophies),
          clan: player.clan?.name ?? null,
          clanRole: player.clan?.name ? clanRoleInitial(player.role) : null,
          wins: player.wins,
          battleCount: player.battleCount,
          leagueNumber: player.currentPathOfLegendSeasonResult?.leagueNumber ?? null,
          leagueMedals: player.currentPathOfLegendSeasonResult?.trophies ?? null,
          leagueRank: player.currentPathOfLegendSeasonResult?.rank ?? null,
          statistics: {
            losses: optionalNumber(player.losses),
            threeCrownWins: optionalNumber(player.threeCrownWins),
            totalDonations: optionalNumber(player.totalDonations),
            starPoints: optionalNumber(player.starPoints),
            accountAgeDays: accountAgeDays(player.badges),
            emotesCollected: badgeProgress(player.badges, "EmoteCollection"),
            currentRankedSeason: rankedSeason(player.currentPathOfLegendSeasonResult),
            lastRankedSeason: rankedSeason(player.lastPathOfLegendSeasonResult),
            bestRankedSeason: rankedSeason(player.bestPathOfLegendSeasonResult),
          },
        },
        collection,
        heroOwnershipAvailable,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { message: "The live Clash Royale service could not be reached. Please try again." },
      { status: 502 },
    );
  }
}
