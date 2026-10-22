import type { BattleCategory, OtherBattleFilter } from "./battle-filters.ts";

/**
 * Converts Supercell's technical battle metadata into stable UI categories.
 * Classification uses API metadata only; it never guesses a mode from decks.
 */

export type BattleClassificationInput = {
  type?: string;
  mode?: string;
  challengeTitle?: string;
  eventTitle?: string;
  teamSize?: number;
  isLadderTournament?: boolean;
  tournamentTag?: string;
};

export type BattleClassification = {
  category: BattleCategory;
  filterMode: OtherBattleFilter | null;
  displayName: string;
};

function normalizedBattleValue(...parts: Array<string | undefined>) {
  return parts
    .filter(Boolean)
    .join(" ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function readableModeName(source: string, fallback: string) {
  const cleaned = source
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\bnew arena\b/gi, "")
    .replace(/\b(?:casual|standard)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || /^(?:pvp|battle|unknown)$/i.test(cleaned)) return fallback;
  return cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function comparableModeName(value: string | undefined) {
  return normalizedBattleValue(value);
}

/**
 * Returns the real ruleset supplied by the battle log when an event title is
 * already being used as the primary label. Generic transport/ruleset names are
 * intentionally hidden: the UI must never invent a variant from deck contents.
 */
export function battleVariantName(
  mode: string | undefined,
  eventTitle: string | undefined,
  primaryName: string,
) {
  if (!mode || !eventTitle) return null;

  const normalizedMode = comparableModeName(mode);
  const normalizedEvent = comparableModeName(eventTitle);
  const normalizedPrimary = comparableModeName(primaryName);

  if (
    !normalizedMode
    || normalizedMode === normalizedEvent
    || normalizedMode === normalizedPrimary
    || /^(?:pvp|battle|unknown|friendly|casual|standard)$/.test(normalizedMode)
    || /challenge all cards event deck(?: no set)?/.test(normalizedMode)
  ) {
    return null;
  }

  const knownVariants: Array<[RegExp, string]> = [
    [/(?:^|\s)(?:4|four) card(?: clash| cycle)?(?:\s|$)/, "4-Card Clash"],
    [/(?:^|\s)triple elixir(?: battle)?(?:\s|$)|(?:^|\s)3x elixir(?:\s|$)/, "Triple Elixir Battle"],
    [/(?:^|\s)double elixir(?: battle)?(?:\s|$)|(?:^|\s)2x elixir(?:\s|$)/, "Double Elixir Battle"],
    [/(?:^|\s)sudden death(?: battle)?(?:\s|$)/, "Sudden Death"],
    [/(?:^|\s)rage(?: battle)?(?:\s|$)/, "Rage Battle"],
    [/(?:^|\s)heist(?: battle)?(?:\s|$)/, "Heist"],
    [/(?:^|\s)ramp up(?: battle)?(?:\s|$)/, "Ramp Up"],
    [/(?:^|\s)blackout(?: battle)?(?:\s|$)/, "Blackout"],
    [/(?:^|\s)dragon hunt(?: battle)?(?:\s|$)/, "Dragon Hunt"],
    [/(?:^|\s)mega monk(?:\s|$)/, "Mega Monk"],
    [/(?:^|\s)(?:snowball bombardment|snowball fight)(?:\s|$)/, "Snowball Bombardment"],
    [/(?:^|\s)(?:capture the mortar|whose mortar is it anyway)(?:\s|$)/, "Capture the Mortar"],
    [/(?:^|\s)(?:everything evolved|all evolutions)(?:\s|$)/, "Everything Evolved"],
    [/(?:^|\s)super (?:troop|unit) showdown(?:\s|$)/, "Super Troop Showdown"],
  ];

  for (const [pattern, label] of knownVariants) {
    if (pattern.test(normalizedMode)) return label;
  }

  const cleaned = mode
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\b(?:new arena|event deck|no set|casual|standard|friendly)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const readable = comparableModeName(cleaned);

  if (
    !readable
    || readable === normalizedEvent
    || readable === normalizedPrimary
    || /^(?:pvp|battle|unknown|challenge|event)$/.test(readable)
  ) {
    return null;
  }

  return cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function classified(
  category: BattleCategory,
  filterMode: OtherBattleFilter | null,
  displayName: string,
): BattleClassification {
  return { category, filterMode, displayName };
}

export function classifyBattle(input: BattleClassificationInput): BattleClassification {
  const value = normalizedBattleValue(input.type, input.mode, input.challengeTitle);
  const eventTitle = normalizedBattleValue(input.eventTitle);
  const has2v2 = (input.teamSize ?? 0) > 1 || /(?:^|\s)(?:2v2|tvt|team vs team)(?:\s|$)/.test(value);

  // Classic and Grand Challenge share an underlying game mode. The live event
  // title, joined by eventTag, is the authoritative discriminator.
  if (/classic challenge/.test(eventTitle) || /classic challenge/.test(value)) {
    return classified("Classic Challenge", "Classic Challenge", "Classic Challenge");
  }
  if (/grand challenge/.test(eventTitle) || /grand challenge/.test(value)) {
    return classified("Grand Challenge", "Grand Challenge", "Grand Challenge");
  }
  if (/mega draft challenge/.test(eventTitle) || /mega draft/.test(value)) {
    return classified("Mega Draft Challenge", "Mega Draft Challenge", "Mega Draft Challenge");
  }

  if (/path of legend|ranked/.test(value)) {
    return classified("Ranked", null, "Ranked");
  }
  if (/trophy|ladder|seasonal arena/.test(value)) {
    return classified("Trophy Road", null, "Ladder");
  }

  if (/seasonal trophy road/.test(eventTitle)) {
    return classified("Trophy Road", null, "Ladder");
  }

  // Once an eventTag has resolved, its title describes the player-facing mode
  // more accurately than reusable technical rulesets such as "Friendly".
  if (eventTitle) {
    if (/classic 2v2/.test(eventTitle)) {
      return classified("2v2", "Party 2v2", "Classic 2v2");
    }
    if (/classic 1v1/.test(eventTitle)) {
      return classified("1v1", "Party 1v1", "Classic 1v1");
    }
    return classified(
      "Special Event",
      "Special Events",
      readableModeName(input.eventTitle ?? "", "Special Event"),
    );
  }

  if (/(?:in clan|clan mate|clanmate)/.test(value)) {
    const filterMode = has2v2 ? "In-clan Friendly: 2v2" : "In-clan Friendly: 1v1";
    return classified("Friendly", filterMode, filterMode);
  }
  if (/(?:fr duel mmapi|friendly duel mmapi|duel mmapi|mmapi)/.test(value)) {
    return classified("Friendly", "Fr Duel MMAPI", "Fr Duel MMAPI");
  }
  if (/(?:friendly|fr) duel/.test(value)) {
    return classified("Friendly", "Friendly Duel", "Friendly Duel");
  }
  if (/friendly/.test(value)) {
    return classified("Friendly", "Friendly", "Friendly");
  }

  if (/colosseum/.test(value)) {
    return classified("Clan War", "Colosseum Duel", "Colosseum Duel");
  }
  if (/river race/.test(value) && /duel/.test(value)) {
    return classified("Clan War", "River Race Duel", "River Race Duel");
  }
  if (/river race/.test(value)) {
    return classified("Clan War", "River Race 1v1", "River Race 1v1");
  }
  if (/boat battle/.test(value)) {
    return classified("Clan War", "Boat Battle", "Boat Battle");
  }
  if (/clan war|war day|war battle/.test(value)) {
    return classified("Clan War", "Any War Battles", "Clan War");
  }

  if (/challenge/.test(value) && has2v2) {
    return classified("2v2", "Challenge: 2v2", "Challenge: 2v2");
  }
  if (/(?:party|casual)/.test(value) && has2v2) {
    return classified("2v2", "Party 2v2", "Party 2v2");
  }
  if (/(?:party|casual)/.test(value)) {
    return classified("1v1", "Party 1v1", "Party 1v1");
  }
  if (has2v2) {
    return classified("2v2", "Party 2v2", "2v2");
  }

  if (/global tournament/.test(value) || input.isLadderTournament) {
    return classified("Tournament", "Global Tournament", "Global Tournament");
  }
  if (/tournament/.test(value) || input.tournamentTag) {
    return classified("Tournament", "Tournament", "Tournament");
  }
  if (/duel/.test(value)) {
    return classified("Other", "Any Duel Battles", "Duel");
  }

  // If event metadata is temporarily unavailable, do not guess between the
  // Classic and Grand queues: both use this same internal mode.
  if (/challenge all cards event deck(?: no set)?/.test(value)) {
    return classified("Other", "Other Battles", "Classic / Grand Challenge");
  }

  if (/challenge|event|draft|touchdown|heist|elixir|sudden death|rage|mirror|capture|dragon hunt|ramp up/.test(value)) {
    const source = input.challengeTitle
      || (input.mode && input.mode.toLowerCase() !== "unknown" ? input.mode : input.type ?? "");
    return classified("Special Event", "Special Events", readableModeName(source, "Special Event"));
  }

  const source = input.challengeTitle
    || (input.mode && input.mode.toLowerCase() !== "unknown" ? input.mode : input.type ?? "");
  return classified("Other", "Other Battles", readableModeName(source, "Battle"));
}
