export type PrimaryBattleFilter = "All" | "Ranked" | "Trophy Road";

// Categories describe a record; filter modes describe the menu entry that
// should select it. Keeping both prevents display names from driving logic.

export type BattleCategory =
  | "Ranked"
  | "Trophy Road"
  | "Classic Challenge"
  | "Grand Challenge"
  | "Mega Draft Challenge"
  | "Clan War"
  | "Friendly"
  | "1v1"
  | "2v2"
  | "Tournament"
  | "Special Event"
  | "Other";

export type OtherBattleFilter =
  | "Classic Challenge"
  | "Grand Challenge"
  | "Mega Draft Challenge"
  | "In-clan Friendly: 1v1"
  | "In-clan Friendly: 2v2"
  | "Friendly"
  | "Friendly Duel"
  | "Fr Duel MMAPI"
  | "River Race 1v1"
  | "River Race Duel"
  | "Colosseum Duel"
  | "Boat Battle"
  | "Party 1v1"
  | "Party 2v2"
  | "Challenge: 2v2"
  | "Tournament"
  | "Global Tournament"
  | "Any Duel Battles"
  | "Any War Battles"
  | "Special Events"
  | "Other Battles";

export type BattleFilter = PrimaryBattleFilter | OtherBattleFilter;

export const primaryBattleFilters: PrimaryBattleFilter[] = ["All", "Ranked", "Trophy Road"];

export const standardOtherBattleFilters: OtherBattleFilter[] = [
  "Classic Challenge",
  "Grand Challenge",
  "Mega Draft Challenge",
  "In-clan Friendly: 1v1",
  "In-clan Friendly: 2v2",
  "Special Events",
  "Friendly",
  "Friendly Duel",
  "Fr Duel MMAPI",
  "River Race 1v1",
  "River Race Duel",
  "Colosseum Duel",
  "Boat Battle",
  "Party 1v1",
  "Party 2v2",
  "Challenge: 2v2",
  "Tournament",
  "Global Tournament",
  "Any Duel Battles",
  "Any War Battles",
];

type FilterableBattle = {
  category: BattleCategory;
  filterMode: OtherBattleFilter | null;
};

const duelModes = new Set<OtherBattleFilter>([
  "Friendly Duel",
  "Fr Duel MMAPI",
  "River Race Duel",
  "Colosseum Duel",
  "Any Duel Battles",
]);

export function battleMatchesFilter(battle: FilterableBattle, filter: BattleFilter) {
  if (filter === "All") return true;
  if (filter === "Ranked" || filter === "Trophy Road") return battle.category === filter;
  if (filter === "Any Duel Battles") {
    return battle.filterMode !== null && duelModes.has(battle.filterMode);
  }
  if (filter === "Any War Battles") return battle.category === "Clan War";
  if (filter === "Special Events") return battle.category === "Special Event";
  if (filter === "Other Battles") return battle.category === "Other";
  return battle.filterMode === filter;
}
