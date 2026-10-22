import { NextRequest, NextResponse } from "next/server";
import { env } from "cloudflare:workers";
import { getSessionAccount, isValidPlayerTag, normalizePlayerTag } from "@/lib/auth";
import { checkGuestPlayerRateLimit } from "@/lib/rate-limit";
import { battleVariantName, classifyBattle } from "@/lib/battle-classification";

type ApiIconUrls = {
  medium?: string;
  evolutionMedium?: string;
  heroMedium?: string;
};

type ApiCard = {
  id: number;
  name: string;
  level?: number;
  maxLevel?: number;
  evolutionLevel?: number;
  elixirCost?: number;
  iconUrls?: ApiIconUrls;
};

type ApiBattlePlayer = {
  tag: string;
  name: string;
  crowns?: number;
  startingTrophies?: number;
  trophyChange?: number;
  kingTowerHitPoints?: number;
  princessTowersHitPoints?: number[];
  clan?: { name?: string };
  cards?: ApiCard[];
  supportCards?: ApiCard[];
};

type ApiBattle = {
  type?: string;
  battleTime?: string;
  eventTag?: string;
  challengeTitle?: string;
  isLadderTournament?: boolean;
  tournamentTag?: string;
  arena?: { name?: string };
  gameMode?: { id?: number; name?: string };
  leagueNumber?: number;
  team?: ApiBattlePlayer[];
  opponent?: ApiBattlePlayer[];
};

type ApiPlayer = {
  tag: string;
  name: string;
};

type CardsResponse = { items?: ApiCard[] };

type ApiTrailEvent = {
  eventTag?: string;
  title?: string;
};

const CATALOG_LIFETIME_MS = 5 * 60 * 1000;
let catalogCache: { value: CardsResponse; expiresAt: number } | null = null;
let catalogRequest: Promise<CardsResponse> | null = null;
let eventsCache: { value: ApiTrailEvent[]; expiresAt: number } | null = null;
let eventsRequest: Promise<ApiTrailEvent[]> | null = null;

function errorMessage(status: number) {
  if (status === 404) return "We could not find that player tag. Check it and try again.";
  if (status === 403) return "The Clash Royale API key is not allowed from this server yet.";
  if (status === 429) return "The Clash Royale API is busy. Please wait a moment and try again.";
  return "Clash Royale did not return the recent battles. Please try again shortly.";
}

async function fetchCatalog(apiBase: string, headers: Record<string, string>) {
  if (catalogCache && catalogCache.expiresAt > Date.now()) return catalogCache.value;

  // Catalog and event metadata are shared by every battle log. Cache them
  // briefly and deduplicate concurrent requests without caching player data.
  if (!catalogRequest) {
    catalogRequest = fetch(`${apiBase}/v1/cards`, { headers, cache: "no-store" })
      .then(async (response) => response.ok ? (await response.json()) as CardsResponse : { items: [] })
      .catch(() => catalogCache?.value ?? { items: [] })
      .finally(() => { catalogRequest = null; });
  }

  const value = await catalogRequest;
  catalogCache = { value, expiresAt: Date.now() + CATALOG_LIFETIME_MS };
  return value;
}

async function fetchEvents(apiBase: string, headers: Record<string, string>) {
  if (eventsCache && eventsCache.expiresAt > Date.now()) return eventsCache.value;

  if (!eventsRequest) {
    eventsRequest = fetch(`${apiBase}/v1/events`, { headers, cache: "no-store" })
      .then(async (response) => response.ok ? (await response.json()) as ApiTrailEvent[] : [])
      .catch(() => [])
      .finally(() => { eventsRequest = null; });
  }

  const value = await eventsRequest;
  if (value.length > 0) {
    eventsCache = { value, expiresAt: Date.now() + CATALOG_LIFETIME_MS };
    return value;
  }

  return eventsCache?.value ?? [];
}

function normalizeCard(
  card: ApiCard,
  catalogById: Map<number, ApiCard>,
  globalMaxLevel: number,
) {
  const catalogCard = catalogById.get(card.id);
  const iconUrls = { ...catalogCard?.iconUrls, ...card.iconUrls };
  // Special forms use a bit mask in battle logs: Evolution = 1, Hero = 2.
  const specialForms = card.evolutionLevel ?? 0;
  const isHero = Boolean(specialForms & 2);
  const isEvolution = Boolean(specialForms & 1);
  const maxLevel = catalogCard?.maxLevel ?? card.maxLevel ?? globalMaxLevel;
  const displayLevel = card.level
    ? card.level + Math.max(0, globalMaxLevel - maxLevel)
    : null;
  const fallbackIconUrl = iconUrls.medium ?? null;
  const iconUrl = isHero
    ? iconUrls.heroMedium ?? iconUrls.evolutionMedium ?? iconUrls.medium ?? null
    : isEvolution
      ? iconUrls.evolutionMedium ?? iconUrls.medium ?? null
      : iconUrls.medium ?? null;

  return {
    id: card.id,
    name: card.name,
    level: displayLevel,
    evolutionLevel: specialForms,
    iconUrl,
    fallbackIconUrl: iconUrl !== fallbackIconUrl ? fallbackIconUrl : null,
  };
}

function normalizeParticipant(
  participant: ApiBattlePlayer,
  catalogById: Map<number, ApiCard>,
  globalMaxLevel: number,
) {
  const sourceCards = participant.cards ?? [];
  const cards = sourceCards.map((card) => normalizeCard(card, catalogById, globalMaxLevel));
  const towerTroops = (participant.supportCards ?? []).map((card) => normalizeCard(card, catalogById, globalMaxLevel));
  const elixirCards = sourceCards.filter((card) => typeof card.elixirCost === "number");
  const averageElixir = elixirCards.length
    ? elixirCards.reduce((total, card) => total + (card.elixirCost ?? 0), 0) / elixirCards.length
    : null;

  return {
    tag: participant.tag,
    name: participant.name,
    clan: participant.clan?.name ?? null,
    crowns: participant.crowns ?? 0,
    startingTrophies: participant.startingTrophies ?? null,
    trophyChange: participant.trophyChange ?? null,
    kingTowerHitPoints: participant.kingTowerHitPoints ?? null,
    princessTowersHitPoints: participant.princessTowersHitPoints ?? [],
    averageElixir,
    cards,
    towerTroops,
  };
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
    return NextResponse.json({ message: "The secure API connection is not configured." }, { status: 503 });
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

    const [playerResponse, battlesResponse, catalog, events] = await Promise.all([
      fetch(`${apiBase}/v1/players/${encodeURIComponent(tag)}`, { headers, cache: "no-store" }),
      fetch(`${apiBase}/v1/players/${encodeURIComponent(tag)}/battlelog`, { headers, cache: "no-store" }),
      fetchCatalog(apiBase, headers),
      fetchEvents(apiBase, headers),
    ]);

    if (!playerResponse.ok) {
      return NextResponse.json({ message: errorMessage(playerResponse.status) }, { status: playerResponse.status });
    }
    if (!battlesResponse.ok) {
      return NextResponse.json({ message: errorMessage(battlesResponse.status) }, { status: battlesResponse.status });
    }

    const player = (await playerResponse.json()) as ApiPlayer;
    const battles = (await battlesResponse.json()) as ApiBattle[];
    const catalogItems = catalog.items ?? [];
    const catalogById = new Map(catalogItems.map((card) => [card.id, card]));
    const eventTitlesByTag = new Map(
      events
        .filter((event): event is Required<Pick<ApiTrailEvent, "eventTag" | "title">> => Boolean(event.eventTag && event.title))
        .map((event) => [event.eventTag.toUpperCase(), event.title]),
    );
    const globalMaxLevel = Math.max(16, ...catalogItems.map((card) => card.maxLevel ?? 1));

    const normalizedBattles = battles.map((battle, battleIndex) => {
      const team = (battle.team ?? []).map((participant) => normalizeParticipant(participant, catalogById, globalMaxLevel));
      const opponents = (battle.opponent ?? []).map((participant) => normalizeParticipant(participant, catalogById, globalMaxLevel));
      const playerSide = team.some((participant) => participant.tag.toUpperCase() === tag) ? team : opponents;
      const opponentSide = playerSide === team ? opponents : team;
      const playerCrowns = Math.max(0, ...playerSide.map((participant) => participant.crowns));
      const opponentCrowns = Math.max(0, ...opponentSide.map((participant) => participant.crowns));
      const result = playerCrowns > opponentCrowns
        ? "Victory"
        : playerCrowns < opponentCrowns
          ? "Defeat"
          : "Draw";
      const rawMode = battle.gameMode?.name ?? battle.type ?? "Battle";
      const type = battle.type ?? "Battle";
      const eventTitle = battle.eventTag
        ? eventTitlesByTag.get(battle.eventTag.toUpperCase())
        : undefined;
      const classification = classifyBattle({
        type,
        mode: rawMode,
        challengeTitle: battle.challengeTitle,
        eventTitle,
        teamSize: Math.max(team.length, opponents.length),
        isLadderTournament: battle.isLadderTournament,
        tournamentTag: battle.tournamentTag,
      });
      const { category, filterMode } = classification;
      const leagueNumber = battle.leagueNumber ?? null;
      const progressionKind = category === "Trophy Road"
        ? "Trophies"
        : category === "Ranked" && leagueNumber !== null && leagueNumber >= 7
          ? "Medals"
          : null;
      const arena = battle.arena?.name ?? null;
      const usesSeasonalArena = category === "Ranked"
        || classification.displayName === "Classic 1v1"
        || classification.displayName === "Classic 2v2";
      const footerContext = usesSeasonalArena
        ? "Seasonal Arena"
        : arena || "Legendary Arena";
      return {
        id: `${battle.battleTime ?? "battle"}-${battleIndex}`,
        battleTime: battle.battleTime ?? null,
        mode: classification.displayName,
        variant: category === "Special Event"
          ? battleVariantName(rawMode, eventTitle, classification.displayName)
          : null,
        category,
        filterMode,
        footerContext,
        progressionKind,
        result,
        playerCrowns,
        opponentCrowns,
        playerSide,
        opponentSide,
      };
    });

    return NextResponse.json(
      {
        player: { tag: player.tag, name: player.name },
        battles: normalizedBattles,
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
