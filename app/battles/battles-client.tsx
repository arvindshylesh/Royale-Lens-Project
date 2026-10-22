"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  Crown,
  Droplet,
  GalleryVerticalEnd,
  Layers3,
  ListOrdered,
  LockKeyhole,
  LogOut,
  Medal,
  Menu,
  Pencil,
  RefreshCw,
  Settings,
  Shield,
  Swords,
  Trophy,
  UserRound,
} from "lucide-react";
import { BrandCrown } from "../components/brand-crown";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  battleMatchesFilter,
  primaryBattleFilters,
  standardOtherBattleFilters,
  type BattleCategory,
  type BattleFilter,
  type OtherBattleFilter,
} from "@/lib/battle-filters";
import { GOLD_PLAYER_TAG } from "@/lib/constants";

type Account = {
  name: string;
  avatarUrl: string | null;
  defaultPlayerTag: string | null;
};

type BookmarkedPlayer = {
  playerTag: string;
  playerName: string;
};

type BattleCard = {
  id: number;
  name: string;
  level: number | null;
  evolutionLevel: number;
  iconUrl: string | null;
  fallbackIconUrl: string | null;
};

type BattleParticipant = {
  tag: string;
  name: string;
  clan: string | null;
  crowns: number;
  startingTrophies: number | null;
  trophyChange: number | null;
  kingTowerHitPoints: number | null;
  princessTowersHitPoints: number[];
  averageElixir: number | null;
  cards: BattleCard[];
  towerTroops: BattleCard[];
};

type Battle = {
  id: string;
  battleTime: string | null;
  mode: string;
  variant: string | null;
  category: BattleCategory;
  filterMode: OtherBattleFilter | null;
  footerContext: string | null;
  progressionKind: "Trophies" | "Medals" | null;
  result: "Victory" | "Defeat" | "Draw";
  playerCrowns: number;
  opponentCrowns: number;
  playerSide: BattleParticipant[];
  opponentSide: BattleParticipant[];
};

type BattleData = {
  player: { tag: string; name: string };
  battles: Battle[];
};

const battlePageSize = 15;

function profileHref(tag: string) {
  return `/?tag=${encodeURIComponent(tag)}`;
}

function profileSectionHref(tag: string, section: "overview" | "upgrade-queue" | "collection") {
  return `/?tag=${encodeURIComponent(tag)}&section=${section}`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

function parseBattleTime(value: string | null) {
  if (!value) return null;
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(?:\.\d+)?Z$/);
  if (match) {
    return new Date(Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6]),
    ));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatBattleAge(value: string | null) {
  const date = parseBattleTime(value);
  if (!date) return "Recent battle";
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (elapsedSeconds < 60) return "Just now";
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function exactBattleTime(value: string | null) {
  const date = parseBattleTime(value);
  return date?.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) ?? "Recent battle";
}

function replaceBrokenCardArt(event: SyntheticEvent<HTMLImageElement>, fallbackUrl: string) {
  const image = event.currentTarget;
  if (image.dataset.fallbackApplied === "true") return;
  image.dataset.fallbackApplied = "true";
  image.src = fallbackUrl;
}

function copyDeckHref(cards: BattleCard[], towerTroop: BattleCard | null) {
  if (cards.length !== 8 || cards.some((card) => !Number.isInteger(card.id) || card.id <= 0)) {
    return null;
  }

  const deck = cards.map((card) => card.id).join(";");
  const slots = cards.map((card) => card.evolutionLevel || 0).join(";");
  const towerTroopParameter = towerTroop?.id ? `&tt=${towerTroop.id}` : "";

  return `https://link.clashroyale.com/en/?clashroyale://copyDeck?deck=${deck}&slots=${slots}${towerTroopParameter}`;
}

function BattleDeckCard({ card }: { card: BattleCard }) {
  return (
    <div className="battle-deck-card" title={`${card.name}${card.level ? ` · Level ${card.level}` : ""}`}>
      <div className="battle-card-art">
        {card.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.iconUrl}
            alt={card.name}
            loading="lazy"
            onError={card.fallbackIconUrl
              ? (event) => replaceBrokenCardArt(event, card.fallbackIconUrl!)
              : undefined}
          />
        ) : (
          <span>{card.name.slice(0, 2)}</span>
        )}
      </div>
      <small>{card.level ? `Lvl ${card.level}` : "—"}</small>
    </div>
  );
}

function BattleParticipantBlock({
  participant,
  viewedTag,
  progressionKind,
}: {
  participant: BattleParticipant;
  viewedTag: string;
  progressionKind: Battle["progressionKind"];
}) {
  const isViewedPlayer = participant.tag.toUpperCase() === viewedTag.toUpperCase();
  const isGoldPlayer = participant.tag.toUpperCase() === GOLD_PLAYER_TAG;
  const participantHref = profileHref(participant.tag);
  const towerTroop = participant.towerTroops[0] ?? null;
  const deckHref = copyDeckHref(participant.cards, towerTroop);
  const totalHitPoints = participant.kingTowerHitPoints === null
    ? null
    : participant.kingTowerHitPoints + participant.princessTowersHitPoints.reduce((total, hitPoints) => total + hitPoints, 0);
  const updatedProgress = participant.startingTrophies !== null && participant.trophyChange !== null
    ? participant.startingTrophies + participant.trophyChange
    : null;
  const showProgress = progressionKind !== null
    && (participant.startingTrophies !== null || participant.trophyChange !== null);
  const ProgressIcon = progressionKind === "Medals" ? Medal : Trophy;

  return (
    <article className={`battle-participant ${isViewedPlayer ? "is-viewed-player" : ""}`}>
      <div className="battle-player-copy">
        <div>
          <a className={isGoldPlayer ? "gold-player-name" : ""} href={participantHref}>{participant.name}</a>
          <span>{participant.clan ?? participant.tag}</span>
          {showProgress && (
            <div className="battle-player-progress" title={`${progressionKind} before and after this battle`}>
              <span className="battle-progress-start">
                <ProgressIcon size={12} />
                {participant.startingTrophies !== null ? formatNumber(participant.startingTrophies) : "—"}
              </span>
              {participant.trophyChange !== null && (
                <span className={`battle-progress-result ${participant.trophyChange >= 0 ? "is-positive" : "is-negative"}`}>
                  <strong>{participant.trophyChange >= 0 ? "+" : ""}{participant.trophyChange}</strong>
                  {updatedProgress !== null && <b>{formatNumber(updatedProgress)}</b>}
                </span>
              )}
            </div>
          )}
        </div>
        <b aria-label={`${participant.crowns} crowns`}>
          <Crown aria-hidden="true" size={13} />
          <span>{participant.crowns}</span>
        </b>
      </div>
      <div className="battle-deck-grid">
        {participant.cards.map((card) => <BattleDeckCard card={card} key={`${participant.tag}-${card.id}`} />)}
      </div>
      <div className="battle-deck-meta">
        <div className="battle-deck-primary">
          <div className="battle-tower-troop">
            {towerTroop?.iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={towerTroop.iconUrl} alt="" loading="lazy" />
            ) : <Crown size={17} />}
            <span>
              <strong>{towerTroop?.name ?? "Tower troop"}</strong>
              <small>{towerTroop?.level ? `Level ${towerTroop.level}` : "Level unavailable"}</small>
            </span>
          </div>
          {deckHref ? (
            <a
              className="battle-copy-deck"
              href={deckHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Copy ${participant.name}'s deck to Clash Royale`}
              title="Copy deck"
            >
              <Copy size={14} />
            </a>
          ) : (
            <button
              className="battle-copy-deck"
              type="button"
              disabled
              aria-label="Copy deck unavailable"
              title="Copy deck unavailable for this battle mode"
            >
              <Copy size={14} />
            </button>
          )}
        </div>
        <div className="battle-elixir" title="Average deck elixir">
          <Droplet size={14} fill="currentColor" />
          <strong>{participant.averageElixir?.toFixed(1) ?? "—"}</strong>
        </div>
        {totalHitPoints !== null && (
          <div className="battle-hit-points" title="Remaining tower hit points">
            <Shield size={13} />
            <strong>{formatNumber(totalHitPoints)} HP</strong>
          </div>
        )}
      </div>
    </article>
  );
}

function BattleSide({
  participants,
  viewedTag,
  label,
  progressionKind,
}: {
  participants: BattleParticipant[];
  viewedTag: string;
  label: string;
  progressionKind: Battle["progressionKind"];
}) {
  return (
    <div className="battle-side" aria-label={label}>
      {participants.map((participant) => (
        <BattleParticipantBlock
          participant={participant}
          viewedTag={viewedTag}
          progressionKind={progressionKind}
          key={participant.tag}
        />
      ))}
    </div>
  );
}

function BattleRecord({ battle, viewedTag }: { battle: Battle; viewedTag: string }) {
  return (
    <article className={`battle-record result-${battle.result.toLowerCase()}`}>
      <span className="battle-result-ribbon">{battle.result}</span>
      <header className="battle-record-header">
        <div className="battle-mode">
          <div className="battle-mode-heading">
            <strong>{battle.mode}</strong>
            {battle.variant ? <span>{battle.variant}</span> : null}
          </div>
          <div className="battle-score" aria-label={`${battle.playerCrowns} crowns to ${battle.opponentCrowns} crowns`}>
            <Crown size={18} />
            <b>{battle.playerCrowns}</b>
            <span>–</span>
            <b>{battle.opponentCrowns}</b>
            <Crown size={18} />
          </div>
        </div>
      </header>
      <div className="battle-comparison">
        <BattleSide participants={battle.playerSide} viewedTag={viewedTag} progressionKind={battle.progressionKind} label="Viewed player deck" />
        <BattleSide participants={battle.opponentSide} viewedTag={viewedTag} progressionKind={battle.progressionKind} label="Opponent deck" />
      </div>
      <footer className="battle-record-footer">
        <time dateTime={battle.battleTime ?? undefined} title={exactBattleTime(battle.battleTime)}>
          <Clock3 size={13} /> {formatBattleAge(battle.battleTime)}
        </time>
        <span>{battle.category}{battle.footerContext ? ` · ${battle.footerContext}` : ""}</span>
      </footer>
    </article>
  );
}

function BattleRecordSkeleton({ item }: { item: number }) {
  return (
    <article className="battle-record battle-skeleton" aria-hidden="true">
      <span className="battle-result-ribbon battle-skeleton-ribbon" />
      <header className="battle-record-header">
        <div className="battle-mode battle-skeleton-mode">
          <span className="battle-skeleton-mode-title" />
          <span className="battle-skeleton-score" />
        </div>
      </header>
      <div className="battle-comparison">
        {[0, 1].map((side) => (
          <div className="battle-side battle-skeleton-side" key={`${item}-${side}`}>
            <div className="battle-participant">
              <div className="battle-player-copy battle-skeleton-player">
                <span className="battle-skeleton-player-copy" />
                <span className="battle-skeleton-crown" />
              </div>
              <div className="battle-deck-grid battle-skeleton-deck">
                {[0, 1, 2, 3, 4, 5, 6, 7].map((card) => (
                  <span className="battle-deck-card" key={card}>
                    <i className="battle-card-art battle-skeleton-card-art" />
                    <small><i className="battle-skeleton-level" /></small>
                  </span>
                ))}
              </div>
              <div className="battle-deck-meta battle-skeleton-meta">
                <div className="battle-deck-primary">
                  <div className="battle-tower-troop battle-skeleton-tower">
                    <i className="battle-skeleton-tower-art" />
                    <span className="battle-skeleton-tower-copy"><i /><i /></span>
                  </div>
                  <span className="battle-copy-deck battle-skeleton-copy" />
                </div>
                <span className="battle-elixir battle-skeleton-pill" />
                <span className="battle-hit-points battle-skeleton-pill" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <footer className="battle-record-footer battle-skeleton-footer">
        <span />
        <span />
      </footer>
    </article>
  );
}

function emptyBattleHeading(filter: BattleFilter) {
  if (filter === "All") return "No Recent Battles";
  return `No ${filter}${filter.endsWith("Battles") ? "" : " Battles"}`;
}

export default function BattlesClient({
  initialTag,
  account,
}: {
  initialTag: string;
  account: Account | null;
}) {
  const router = useRouter();
  const [data, setData] = useState<BattleData | null>(null);
  const [filter, setFilter] = useState<BattleFilter>("All");
  const [visibleBattleCount, setVisibleBattleCount] = useState(battlePageSize);
  const [loading, setLoading] = useState(Boolean(initialTag));
  const [message, setMessage] = useState<string | null>(initialTag ? null : "Choose a player profile before opening Battles.");
  const [otherMenuOpen, setOtherMenuOpen] = useState(false);
  const [isPortraitMobile, setIsPortraitMobile] = useState(false);
  const [currentAccount, setCurrentAccount] = useState(account);
  const [navigationMenuOpen, setNavigationMenuOpen] = useState(false);
  const [bookmarks, setBookmarks] = useState<BookmarkedPlayer[]>([]);
  const [bookmarksLoaded, setBookmarksLoaded] = useState(!account);
  const [mobileBookmarksOpen, setMobileBookmarksOpen] = useState(false);
  const [defaultPlayerDialogOpen, setDefaultPlayerDialogOpen] = useState(false);
  const [defaultPlayerDraft, setDefaultPlayerDraft] = useState("");
  const [defaultPlayerSaving, setDefaultPlayerSaving] = useState(false);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const otherFilterButtonRef = useRef<HTMLButtonElement>(null);
  const otherFilterUsedWithPointerRef = useRef(false);
  const otherFilterTouchGestureRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);
  const otherFilterTouchTapRef = useRef(false);
  const otherFilterWasTouchRef = useRef(false);
  const loadMoreBattlesRef = useRef<HTMLDivElement>(null);

  const fetchBattles = useCallback(async () => {
    if (!initialTag) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/battles?tag=${encodeURIComponent(initialTag)}`, { cache: "no-store" });
      const payload = (await response.json()) as BattleData & { message?: string };
      if (!response.ok) throw new Error(payload.message || "Recent battles could not be loaded.");
      setData(payload);
      setFilter("All");
      setVisibleBattleCount(battlePageSize);
      setOtherMenuOpen(false);
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Recent battles could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [initialTag]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void fetchBattles());
    return () => window.cancelAnimationFrame(frame);
  }, [fetchBattles]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px) and (orientation: portrait)");
    const updateLayout = () => setIsPortraitMobile(media.matches);
    updateLayout();
    media.addEventListener("change", updateLayout);
    return () => media.removeEventListener("change", updateLayout);
  }, []);

  useEffect(() => {
    if (!currentAccount) return;

    const controller = new AbortController();
    const loadBookmarks = async () => {
      setBookmarksLoaded(false);
      try {
        const response = await fetch("/api/bookmarks", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as {
          bookmarks?: BookmarkedPlayer[];
          message?: string;
        };
        if (!response.ok || !payload.bookmarks) {
          throw new Error(payload.message || "Your bookmarked players could not be loaded.");
        }
        setBookmarks(payload.bookmarks);
      } catch (error) {
        if (controller.signal.aborted) return;
        setMessage(error instanceof Error ? error.message : "Your bookmarked players could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setBookmarksLoaded(true);
      }
    };

    void loadBookmarks();
    return () => controller.abort();
  }, [currentAccount]);

  const displayedBattles = useMemo(
    () => data?.battles.filter((battle) => battleMatchesFilter(battle, filter)) ?? [],
    [data?.battles, filter],
  );
  const visibleBattles = useMemo(
    () => displayedBattles.slice(0, visibleBattleCount),
    [displayedBattles, visibleBattleCount],
  );
  const hasMoreBattles = visibleBattleCount < displayedBattles.length;

  useEffect(() => {
    if (!hasMoreBattles) return;
    if (!("IntersectionObserver" in window)) {
      const timeout = globalThis.setTimeout(() => setVisibleBattleCount(displayedBattles.length));
      return () => globalThis.clearTimeout(timeout);
    }

    const sentinel = loadMoreBattlesRef.current;
    if (!sentinel) return;

    // Render 15 records initially and reveal the next batch near the end of
    // the list. The API is fetched once because its battle log is capped.
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      setVisibleBattleCount((currentCount) => Math.min(
        currentCount + battlePageSize,
        displayedBattles.length,
      ));
    }, { rootMargin: "0px 0px 280px 0px", threshold: 0.01 });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [displayedBattles.length, hasMoreBattles]);

  const availableOtherFilters = useMemo(() => {
    const battles = data?.battles ?? [];
    return [
      ...standardOtherBattleFilters,
      ...(battles.some((battle) => battle.category === "Other") ? ["Other Battles" as const] : []),
    ];
  }, [data?.battles]);
  const isOtherFilterSelected = !primaryBattleFilters.some((item) => item === filter);
  const activeTag = data?.player.tag ?? initialTag;
  const profileUrl = activeTag ? profileHref(activeTag) : "/";
  const defaultProfileUrl = currentAccount?.defaultPlayerTag
    ? profileHref(currentAccount.defaultPlayerTag)
    : "/";
  const canUseQueue = Boolean(
    currentAccount?.defaultPlayerTag
      && activeTag
      && currentAccount.defaultPlayerTag.toUpperCase() === activeTag.toUpperCase(),
  );

  function openBookmarkedPlayer(bookmark: BookmarkedPlayer) {
    setNavigationMenuOpen(false);
    setMobileBookmarksOpen(false);
    window.location.assign(profileHref(bookmark.playerTag));
  }

  function openDefaultPlayerEditor() {
    setDefaultPlayerDraft(currentAccount?.defaultPlayerTag ?? "");
    setAccountMessage(null);
    setNavigationMenuOpen(false);
    setDefaultPlayerDialogOpen(true);
  }

  async function saveDefaultPlayer(event: FormEvent) {
    event.preventDefault();
    setDefaultPlayerSaving(true);
    setAccountMessage(null);
    try {
      const response = await fetch("/api/account/default-player", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerTag: defaultPlayerDraft }),
      });
      const payload = (await response.json()) as { account?: Account; message?: string };
      if (!response.ok || !payload.account) {
        throw new Error(payload.message || "Your default player could not be saved.");
      }
      setCurrentAccount(payload.account);
      setDefaultPlayerDialogOpen(false);
      if (payload.account.defaultPlayerTag) {
        window.location.assign(profileHref(payload.account.defaultPlayerTag));
      }
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : "Your default player could not be saved.");
    } finally {
      setDefaultPlayerSaving(false);
    }
  }

  async function logout() {
    setNavigationMenuOpen(false);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/");
      router.refresh();
    }
  }

  return (
    <main className="arena-shell battles-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar">
        <a className="brand brand-button" href={defaultProfileUrl} aria-label="Load default player profile">
          <span className="brand-mark"><BrandCrown size={21} /></span>
          <span className="brand-name">Royale Lens</span>
        </a>
        <DropdownMenu open={navigationMenuOpen} onOpenChange={setNavigationMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button className="navigation-menu-button" type="button" aria-label="Open navigation menu">
              <Menu size={22} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="navigation-menu" align="end" sideOffset={10}>
            {currentAccount && (
              <>
                <DropdownMenuLabel className="navigation-account">
                  <span className="navigation-avatar">
                    {currentAccount.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={currentAccount.avatarUrl} alt="" referrerPolicy="no-referrer" />
                    ) : <UserRound size={16} />}
                  </span>
                  <span><strong>{currentAccount.name}</strong><small>{currentAccount.defaultPlayerTag ?? "No default player"}</small></span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem asChild>
              <a href={activeTag ? profileSectionHref(activeTag, "overview") : "/"}>
                <BarChart3 size={17} /> Overview
              </a>
            </DropdownMenuItem>
            {canUseQueue ? (
              <DropdownMenuItem asChild>
                <a href={profileSectionHref(activeTag, "upgrade-queue")}><ListOrdered size={17} /> Upgrade Queue</a>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem disabled><LockKeyhole size={17} /> Upgrade Queue <span className="navigation-locked">Default only</span></DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <a href={activeTag ? profileSectionHref(activeTag, "collection") : "/"}>
                <Layers3 size={17} /> Collection
              </a>
            </DropdownMenuItem>
            {currentAccount ? (
              <>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="bookmarks-desktop-trigger">
                    <Bookmark size={17} /> Bookmarked
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent
                    className="navigation-menu bookmarks-submenu"
                    align="start"
                    sideOffset={8}
                    collisionPadding={12}
                  >
                    <DropdownMenuLabel className="bookmarks-heading">
                      <span>Bookmarked Players</span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {!bookmarksLoaded ? (
                      <DropdownMenuItem disabled className="bookmark-menu-state">
                        <RefreshCw className="animate-spin" size={15} /> Loading players…
                      </DropdownMenuItem>
                    ) : bookmarks.length === 0 ? (
                      <DropdownMenuItem disabled className="bookmark-menu-state">
                        No bookmarked players yet
                      </DropdownMenuItem>
                    ) : (
                      bookmarks.map((bookmark) => (
                        <DropdownMenuItem key={bookmark.playerTag} asChild>
                          <button
                            className="bookmark-player-item"
                            type="button"
                            onClick={() => openBookmarkedPlayer(bookmark)}
                          >
                            <span className="bookmark-player-copy">
                              <strong className={bookmark.playerTag === GOLD_PLAYER_TAG ? "gold-player-name" : ""}>
                                {bookmark.playerName}
                              </strong>
                              <small>{bookmark.playerTag}</small>
                            </span>
                            <ChevronRight size={16} aria-hidden="true" />
                          </button>
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem
                  className="bookmarks-mobile-trigger"
                  onSelect={() => setMobileBookmarksOpen(true)}
                >
                  <Bookmark size={17} /> Bookmarked <ChevronRight size={16} className="bookmarks-mobile-chevron" />
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem disabled>
                <LockKeyhole size={17} /> Bookmarked <span className="navigation-locked">Sign in</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="navigation-current"><Swords size={17} /> Battles</DropdownMenuItem>
            <DropdownMenuItem disabled><GalleryVerticalEnd size={17} /> Decks <span className="navigation-soon">Soon</span></DropdownMenuItem>
            {currentAccount && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger><Settings size={17} /> Settings</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="navigation-menu settings-submenu" sideOffset={8}>
                    <DropdownMenuItem onSelect={openDefaultPlayerEditor}>
                      <Pencil size={16} /> Edit default player
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => void logout()}>
                      <LogOut size={16} /> Logout
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <Dialog open={mobileBookmarksOpen} onOpenChange={setMobileBookmarksOpen}>
        <DialogContent className="mobile-bookmarks-dialog">
          <DialogHeader>
            <DialogTitle>Bookmarked Players</DialogTitle>
            <DialogDescription className="sr-only">
              Choose a bookmarked player profile to load.
            </DialogDescription>
          </DialogHeader>
          <div className="mobile-bookmarks-list">
            {!bookmarksLoaded ? (
              <div className="mobile-bookmark-state">
                <RefreshCw className="animate-spin" size={17} /> Loading players…
              </div>
            ) : bookmarks.length === 0 ? (
              <div className="mobile-bookmark-state">No bookmarked players yet</div>
            ) : (
              bookmarks.map((bookmark) => (
                <button
                  className="mobile-bookmark-player"
                  key={bookmark.playerTag}
                  type="button"
                  onClick={() => openBookmarkedPlayer(bookmark)}
                >
                  <span className="bookmark-player-copy">
                    <strong className={bookmark.playerTag === GOLD_PLAYER_TAG ? "gold-player-name" : ""}>
                      {bookmark.playerName}
                    </strong>
                    <small>{bookmark.playerTag}</small>
                  </span>
                  <ChevronRight size={17} aria-hidden="true" />
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={defaultPlayerDialogOpen} onOpenChange={setDefaultPlayerDialogOpen}>
        <DialogContent className="account-dialog default-player-dialog">
          <DialogHeader>
            <span className="dialog-mark"><UserRound size={20} /></span>
            <DialogTitle>{currentAccount?.defaultPlayerTag ? "Edit default player" : "Add your default player"}</DialogTitle>
            <DialogDescription>
              This profile opens automatically after sign-in and owns your private Upgrade Queue.
            </DialogDescription>
          </DialogHeader>
          <form className="default-player-form" onSubmit={saveDefaultPlayer}>
            <label htmlFor="battles-default-player-tag">Player tag</label>
            <Input
              id="battles-default-player-tag"
              value={defaultPlayerDraft}
              onChange={(event) => setDefaultPlayerDraft(event.target.value.toUpperCase())}
              placeholder="#ABC123"
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />
            {accountMessage && <p className="account-message" role="alert">{accountMessage}</p>}
            <Button type="submit" disabled={defaultPlayerSaving || !defaultPlayerDraft.trim()}>
              {defaultPlayerSaving ? <RefreshCw className="animate-spin" size={16} /> : <Check size={16} />}
              {defaultPlayerSaving ? "Saving" : "Save default player"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <section className="battles-page">
        <header className="battles-page-header">
          <a className="battles-back" href={profileUrl}><ArrowLeft size={17} /><span>Profile</span></a>
          <div className="battles-title-copy">
            <span className="section-kicker">Recent matches</span>
            <h1>Battle History</h1>
            <p>The latest battles available from the official Clash Royale battle log.</p>
          </div>
          <div className="battles-player-summary">
            <div>
              <strong className={activeTag.toUpperCase() === GOLD_PLAYER_TAG ? "gold-player-name" : ""}>
                {data?.player.name ?? "Loading player"}
              </strong>
              <span>{activeTag || "No player selected"}</span>
            </div>
            <button type="button" onClick={() => void fetchBattles()} disabled={loading || !initialTag} aria-label="Refresh recent battles">
              <RefreshCw className={loading ? "animate-spin" : ""} size={17} />
              <span>{loading ? "Loading" : "Refresh"}</span>
            </button>
          </div>
        </header>

        {data ? (
          <div className="battle-filter-bar" aria-label="Filter battles">
            {primaryBattleFilters.map((item) => (
              <button
                className={filter === item ? "is-selected" : ""}
                type="button"
                aria-pressed={filter === item}
                onClick={() => {
                  setFilter(item);
                  setVisibleBattleCount(battlePageSize);
                  setOtherMenuOpen(false);
                }}
                key={item}
              >
                {item === "Trophy Road" ? "Ladder" : item}
              </button>
            ))}
            <DropdownMenu open={otherMenuOpen} onOpenChange={setOtherMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  ref={otherFilterButtonRef}
                  className={isOtherFilterSelected ? "is-selected" : ""}
                  type="button"
                  aria-pressed={isOtherFilterSelected}
                  onPointerDownCapture={(event) => {
                    otherFilterWasTouchRef.current = event.pointerType === "touch";
                    if (event.pointerType !== "touch") return;
                    otherFilterUsedWithPointerRef.current = true;
                    otherFilterTouchTapRef.current = false;
                    otherFilterTouchGestureRef.current = {
                      startX: event.clientX,
                      startY: event.clientY,
                      moved: false,
                    };
                    event.stopPropagation();
                  }}
                  onPointerMoveCapture={(event) => {
                    const gesture = otherFilterTouchGestureRef.current;
                    if (event.pointerType !== "touch" || !gesture || gesture.moved) return;
                    gesture.moved = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 9;
                  }}
                  onPointerUpCapture={(event) => {
                    if (event.pointerType !== "touch") return;
                    otherFilterTouchTapRef.current = !otherFilterTouchGestureRef.current?.moved;
                    otherFilterTouchGestureRef.current = null;
                    event.stopPropagation();
                  }}
                  onPointerCancelCapture={() => {
                    otherFilterTouchTapRef.current = false;
                    otherFilterTouchGestureRef.current = null;
                  }}
                  onPointerDown={() => { otherFilterUsedWithPointerRef.current = true; }}
                  onKeyDown={() => {
                    otherFilterWasTouchRef.current = false;
                    otherFilterUsedWithPointerRef.current = false;
                  }}
                  onClick={(event) => {
                    if (!otherFilterWasTouchRef.current) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const isTap = otherFilterTouchTapRef.current;
                    otherFilterWasTouchRef.current = false;
                    otherFilterTouchTapRef.current = false;
                    if (isTap) setOtherMenuOpen((open) => !open);
                  }}
                >
                  Others <ChevronDown size={14} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="battle-filter-menu"
                align={isPortraitMobile ? "center" : "end"}
                alignOffset={isPortraitMobile ? 0 : -6}
                side="bottom"
                sideOffset={isPortraitMobile ? 9 : 7}
                avoidCollisions={isPortraitMobile}
                collisionPadding={12}
                onKeyDown={() => { otherFilterUsedWithPointerRef.current = false; }}
                onPointerDownOutside={() => { otherFilterUsedWithPointerRef.current = true; }}
                onCloseAutoFocus={(event) => {
                  if (!otherFilterUsedWithPointerRef.current) return;
                  event.preventDefault();
                  otherFilterUsedWithPointerRef.current = false;
                  requestAnimationFrame(() => otherFilterButtonRef.current?.blur());
                }}
              >
                <DropdownMenuLabel>Other battle modes</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {availableOtherFilters.map((item) => (
                  <DropdownMenuItem
                    className={filter === item ? "is-selected" : ""}
                    onSelect={() => {
                      setFilter(item);
                      setVisibleBattleCount(battlePageSize);
                      setOtherMenuOpen(false);
                    }}
                    key={item}
                  >
                    <span>{item}</span>
                    {filter === item && <Check size={14} />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : loading ? (
          <div className="battle-filter-loading" aria-hidden="true">
            {[0, 1, 2, 3].map((item) => <span key={item} />)}
          </div>
        ) : null}

        {loading ? (
          <div className="battle-loading" role="status" aria-label="Loading recent battles">
            {[0, 1, 2].map((item) => <BattleRecordSkeleton item={item} key={item} />)}
          </div>
        ) : message ? (
          <div className="battles-state is-error">
            <Swords size={25} />
            <strong>Battle history unavailable</strong>
            <p>{message}</p>
            <div>
              <a href={profileUrl}>Return to profile</a>
              {initialTag && <button type="button" onClick={() => void fetchBattles()}>Try again</button>}
            </div>
          </div>
        ) : displayedBattles.length ? (
          <>
            <div className="battle-list">
              {visibleBattles.map((battle) => <BattleRecord battle={battle} viewedTag={activeTag} key={battle.id} />)}
            </div>
            {hasMoreBattles && <div className="battle-load-sentinel" ref={loadMoreBattlesRef} aria-hidden="true" />}
          </>
        ) : (
          <div className="battles-state">
            <Swords size={25} />
            <strong>{emptyBattleHeading(filter)}</strong>
            <p>{filter === "All" ? "The official API did not return any recent matches for this player." : "Choose another battle type to view available matches."}</p>
          </div>
        )}
      </section>

      <footer>
        <span>Royale Lens</span>
        <p>Not affiliated with Supercell. Recent battle data is supplied by the official Clash Royale API.</p>
      </footer>
    </main>
  );
}
