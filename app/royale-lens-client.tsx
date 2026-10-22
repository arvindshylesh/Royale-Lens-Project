"use client";

import { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Crown,
  GalleryVerticalEnd,
  GripVertical,
  Info,
  Layers3,
  ListOrdered,
  LockKeyhole,
  LogOut,
  Menu,
  Medal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Swords,
  Trophy,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { BrandCrown } from "./components/brand-crown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  getQueueTargetIndex,
  normalizeQueueOrder,
  queueLimits,
  queueRarities,
  reorderQueueItem,
  type QueueRarity as Rarity,
} from "@/lib/queue-order";
import { GOLD_PLAYER_TAG } from "@/lib/constants";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type CollectionCard = {
  id: number;
  name: string;
  rarity: Rarity;
  elixirCost: number | null;
  level: number | null;
  maxLevel: number;
  count: number;
  copiesNeeded: number | null;
  unlocked: boolean;
  iconUrl: string | null;
  evolutionIconUrl: string | null;
  heroIconUrl: string | null;
  hasEvolution: boolean;
  evolutionUnlocked: boolean;
  hasHero: boolean;
  heroUnlocked: boolean | null;
  isTowerTroop: boolean;
};

type CollectionFilter = Rarity | "All" | "Evolutions" | "Heroes" | "Tower Troops";
type SortKey = "level" | "elixir" | "rarity";
type SortDirection = "asc" | "desc";
type QueueItem = { cardId: number; rarity: Rarity; position: number };
type QueueSaveStatus = "idle" | "saving" | "saved" | "error";
type BookmarkedPlayer = {
  playerTag: string;
  playerName: string;
  position: number;
};
type Account = {
  name: string;
  avatarUrl: string | null;
  defaultPlayerTag: string | null;
  onboardingDismissed: boolean;
};

function replaceBrokenCardArt(event: SyntheticEvent<HTMLImageElement>, fallbackUrl: string) {
  const image = event.currentTarget;
  if (image.dataset.fallbackApplied === "true") return;
  image.dataset.fallbackApplied = "true";
  image.src = fallbackUrl;
}

declare global {
  interface Window {
    __royaleLensInitialProfileRequest?: Promise<Response>;
    google?: {
      accounts: {
        id: {
          initialize(config: { client_id: string; callback: (response: { credential?: string }) => void }): void;
          renderButton(element: HTMLElement, options: Record<string, string | number | boolean>): void;
          cancel(): void;
        };
      };
    };
  }
}

type DashboardData = {
  syncedAt: string;
  player: {
    tag: string;
    name: string;
    expLevel: number;
    kingTowerLevel: number;
    collectionLevel: number;
    trophies: number;
    trophyRoadTrophies: number;
    maxTrophies: number;
    bestTrophies: number;
    arena: string;
    arenaLabel: string;
    clan: string | null;
    clanRole: string | null;
    wins: number;
    battleCount: number;
    leagueNumber: number | null;
    leagueMedals: number | null;
    leagueRank: number | null;
    statistics: {
      losses: number | null;
      threeCrownWins: number | null;
      totalDonations: number | null;
      starPoints: number | null;
      accountAgeDays: number | null;
      emotesCollected: number | null;
      currentRankedSeason: RankedSeason | null;
      lastRankedSeason: RankedSeason | null;
      bestRankedSeason: RankedSeason | null;
    };
  };
  collection: CollectionCard[];
  heroOwnershipAvailable: boolean;
};

type RankedSeason = {
  leagueNumber: number | null;
  medals: number | null;
  rank: number | null;
};

type StatsRow = {
  label: string;
  value: string;
  info?: React.ReactNode;
  onSelect?: () => void;
  expanded?: boolean;
  controls?: string;
  detail?: React.ReactNode;
};

type RarityBreakdownItem = {
  rarity: Rarity;
  unlocked: number;
  total: number;
};

const collectionFilters: CollectionFilter[] = ["All", "Common", "Rare", "Epic", "Legendary", "Champion", "Evolutions", "Heroes", "Tower Troops"];
const rarityOrder: Record<Rarity, number> = {
  Common: 0,
  Rare: 1,
  Epic: 2,
  Legendary: 3,
  Champion: 4,
};

const rarityClass: Record<Rarity, string> = {
  Common: "rarity-common",
  Rare: "rarity-rare",
  Epic: "rarity-epic",
  Legendary: "rarity-legendary",
  Champion: "rarity-champion",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

function formatOptionalNumber(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : formatNumber(value);
}

function formatLeague(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `League ${value}`;
}

function formatMedalsWithRank(
  medals: number | null | undefined,
  rank: number | null | undefined,
) {
  const medalsCopy = formatOptionalNumber(medals);
  return rank && rank > 0 ? `${medalsCopy} · #${formatNumber(rank)}` : medalsCopy;
}

function formatAccountAge(days: number | null | undefined) {
  if (days === null || days === undefined) return "Under 1 year";
  const wholeDays = Math.max(0, Math.floor(days));
  const years = Math.floor(wholeDays / 365);
  const weeks = Math.floor((wholeDays % 365) / 7);
  if (years < 1) return weeks > 0 ? `${weeks}w` : `${wholeDays}d`;
  return weeks > 0 ? `${years}y ${weeks}w` : `${years}y`;
}

function RarityBreakdown({ items }: { items: RarityBreakdownItem[] }) {
  return (
    <div className="rarity-breakdown-list">
      {items.map((item) => (
        <div className={rarityClass[item.rarity]} key={item.rarity}>
          <span><i aria-hidden="true" />{item.rarity}</span>
          <strong>{item.unlocked} / {item.total}</strong>
        </div>
      ))}
    </div>
  );
}

function StatsGroup({
  icon,
  title,
  rows,
}: {
  icon: React.ReactNode;
  title: string;
  rows: StatsRow[];
}) {
  return (
    <section className="stats-group">
      <div className="stats-group-heading">
        <span>{icon}</span>
        <h3>{title}</h3>
      </div>
      <div className="stats-rows">
        {rows.map((row) => row.onSelect ? (
          <div className="stats-row-cluster" key={row.label}>
            <button
              className="stats-row stats-row-button"
              type="button"
              onClick={row.onSelect}
              aria-expanded={row.expanded}
              aria-controls={row.controls}
            >
              <span className="stats-row-label">{row.label}</span>
              <strong className="stats-row-value" title={row.value}>{row.value}</strong>
              <ChevronRight className={row.expanded ? "is-expanded" : ""} size={14} aria-hidden="true" />
            </button>
            {row.detail && (
              <div
                className={`stats-row-detail ${row.expanded ? "is-expanded" : ""}`}
                aria-hidden={!row.expanded}
              >
                {row.detail}
              </div>
            )}
          </div>
        ) : (
          <div className="stats-row" key={row.label}>
            <span className="stats-row-label-wrap">
              <span className="stats-row-label">{row.label}</span>
              {row.info}
            </span>
            <strong className="stats-row-value" title={row.value}>{row.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function BestTrophiesInfo() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;

    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    };

    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [open]);

  return (
    <span className="best-trophies-info" ref={rootRef}>
      <button
        type="button"
        aria-label="About best trophies"
        aria-expanded={open}
        aria-describedby={open ? "best-trophies-explanation" : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <Info size={11} aria-hidden="true" />
      </button>
      {open && (
        <span className="best-trophies-popover" id="best-trophies-explanation" role="tooltip">
          Highest trophies observed by Royale Lens. Older records from before tracking began may not be included.
        </span>
      )}
    </span>
  );
}

function formatSyncedTime(value: string) {
  const syncedAt = new Date(value);
  if (Number.isNaN(syncedAt.getTime())) return "Synced";

  return `Synced ${syncedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function getPlayerGameUrl(tag: string) {
  const normalizedTag = tag.trim().replace(/^#/, "");
  return `https://link.clashroyale.com/en/?clashroyale://playerInfo?id=${encodeURIComponent(normalizedTag)}`;
}

function ResponsivePlayerName({ name, isGold }: { name: string; isGold: boolean }) {
  const nameRef = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    const nameElement = nameRef.current;
    if (!nameElement) return;

    const portraitMobile = window.matchMedia("(max-width: 760px) and (orientation: portrait)");
    let animationFrame = 0;

    const fitName = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        nameElement.style.removeProperty("--player-name-fit-size");
        if (!portraitMobile.matches) return;

        const nameRow = nameElement.parentElement;
        const ribbon = nameElement.closest(".hero-panel")?.querySelector<HTMLElement>(".profile-bookmark-button");
        const rowWidth = nameRow?.clientWidth ?? 0;
        const nameLeft = nameElement.getBoundingClientRect().left;
        const ribbonLeft = ribbon?.getBoundingClientRect().left ?? Number.POSITIVE_INFINITY;
        // Keep long portrait-mode names inside the identity column instead of
        // letting them visually run underneath the bookmark ribbon.
        const ribbonSafeWidth = ribbonLeft - nameLeft - 36;
        const availableWidth = Math.max(0, Math.min(rowWidth, ribbonSafeWidth));
        const naturalWidth = nameElement.scrollWidth;
        const initialSize = Number.parseFloat(window.getComputedStyle(nameElement).fontSize);
        if (!availableWidth || !naturalWidth || naturalWidth <= availableWidth) return;

        const fittedSize = Math.max(15, Math.floor((initialSize * availableWidth / naturalWidth) * 100) / 100);
        nameElement.style.setProperty("--player-name-fit-size", `${fittedSize}px`);
      });
    };

    fitName();
    window.addEventListener("resize", fitName);
    portraitMobile.addEventListener("change", fitName);
    void document.fonts?.ready.then(fitName);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", fitName);
      portraitMobile.removeEventListener("change", fitName);
    };
  }, [name]);

  return (
    <h1 ref={nameRef} className={`player-name ${isGold ? "gold-player-name" : ""}`}>
      {name}
    </h1>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
}

function normalizeQueueItems(items: QueueItem[]) {
  return normalizeQueueOrder(items, queueRarities) as QueueItem[];
}

function DualFormCardName({
  name,
  evolutionUnlocked,
}: {
  name: string;
  evolutionUnlocked: boolean;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLHeadingElement>(null);
  const fullBadgeRef = useRef<HTMLSpanElement>(null);
  const [useCompactBadge, setUseCompactBadge] = useState(false);

  useEffect(() => {
    const row = rowRef.current;
    const cardName = nameRef.current;
    const fullBadge = fullBadgeRef.current;
    if (!row || !cardName || !fullBadge) return;

    let active = true;
    const measure = () => {
      if (!active) return;
      const gap = Number.parseFloat(window.getComputedStyle(row).columnGap) || 0;
      const needsCompactBadge = cardName.scrollWidth + fullBadge.offsetWidth + gap > row.clientWidth + 0.5;
      setUseCompactBadge(needsCompactBadge);
    };

    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(row);
    void document.fonts?.ready.then(measure);

    return () => {
      active = false;
      observer?.disconnect();
    };
  }, [name]);

  const badgeClass = `form-badge evo-badge ${evolutionUnlocked ? "is-unlocked" : ""}`;

  return (
    <div className="card-name-row" ref={rowRef}>
      <h3 ref={nameRef}>{name}</h3>
      <span
        className={`${badgeClass} ${useCompactBadge ? "is-compact" : ""}`}
        title={`Evolution ${evolutionUnlocked ? "unlocked" : "locked"}`}
        aria-label={`Evolution ${evolutionUnlocked ? "unlocked" : "locked"}`}
      >
        <Zap size={11} />
        {!useCompactBadge && <span>Evo</span>}
        <i />
      </span>
      <span className={`${badgeClass} form-badge-measure`} ref={fullBadgeRef} aria-hidden="true">
        <Zap size={11} /> <span>Evo</span> <i />
      </span>
    </div>
  );
}

function GoogleSignInButton({
  clientId,
  onCredential,
  onPainted,
}: {
  clientId: string;
  onCredential: (credential: string) => void;
  onPainted: () => void;
}) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);

  useLayoutEffect(() => {
    const googleIdentity = window.google?.accounts.id;
    if (!googleIdentity) return;

    googleIdentity.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response.credential) onCredential(response.credential);
      },
    });

    const element = buttonRef.current;
    if (!element) return;
    setIsReady(false);
    element.replaceChildren();

    let active = true;
    let revealed = false;
    let settleTimer = 0;
    let firstPaintFrame = 0;
    let secondPaintFrame = 0;
    let handoffFrame = 0;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      settleTimer = window.setTimeout(() => {
        firstPaintFrame = window.requestAnimationFrame(() => {
          secondPaintFrame = window.requestAnimationFrame(() => {
            if (!active) return;
            setIsReady(true);
            // Give React one paint to replace the loading face with Google's
            // real iframe before the landing-page preflight is dismissed.
            handoffFrame = window.requestAnimationFrame(onPainted);
          });
        });
      }, 90);
    };
    // Google paints an iframe asynchronously. Keep the stable Royale Lens
    // button face visible until that iframe has completed two browser paints;
    // this prevents a flash of Google's unfinished button during page load.
    const observer = new MutationObserver(() => {
      const iframe = element.querySelector("iframe");
      if (!iframe) return;
      iframe.addEventListener("load", reveal, { once: true });
      observer.disconnect();
    });
    observer.observe(element, { childList: true, subtree: true });

    googleIdentity.renderButton(element, {
      type: "standard",
      theme: "filled_black",
      size: "large",
      shape: "pill",
      text: "continue_with",
      width: Math.min(340, Math.max(1, Math.round(element.clientWidth || 300))),
    });

    return () => {
      active = false;
      observer.disconnect();
      window.clearTimeout(settleTimer);
      window.cancelAnimationFrame(firstPaintFrame);
      window.cancelAnimationFrame(secondPaintFrame);
      window.cancelAnimationFrame(handoffFrame);
    };
  }, [clientId, onCredential, onPainted]);

  return (
    <div className={`google-button-frame ${isReady ? "is-ready" : "is-loading"}`}>
      <div className="google-button-slot" ref={buttonRef} aria-label="Continue with Google" />
      <div className="google-button-face" aria-hidden="true">
        <span className="google-button-mark">
          <svg viewBox="0 0 18 18" focusable="false">
            <path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.797 2.715v2.258h2.909c1.702-1.567 2.684-3.875 2.684-6.613Z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.182l-2.909-2.258c-.806.54-1.835.859-3.047.859-2.344 0-4.328-1.585-5.037-3.714H.956v2.332A9 9 0 0 0 9 18Z" />
            <path fill="#FBBC05" d="M3.963 10.705A5.41 5.41 0 0 1 3.681 9c0-.592.102-1.168.282-1.705V4.963H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.037l3.007-2.332Z" />
            <path fill="#EA4335" d="M9 3.581c1.321 0 2.507.454 3.44 1.345l2.582-2.582C13.463.891 11.426 0 9 0A9 9 0 0 0 .956 4.963l3.007 2.332C4.672 5.166 6.656 3.581 9 3.581Z" />
          </svg>
        </span>
        <span className="google-button-label">Continue with Google</span>
      </div>
    </div>
  );
}

function waitForGoogleIdentity(): Promise<boolean> {
  if (window.google?.accounts.id) return Promise.resolve(true);

  // The root layout normally loads GIS. This fallback also supports delayed
  // or blocked scripts and always settles so the guest landing page can open.
  return new Promise((resolve) => {
    const existing = document.getElementById("google-identity-services") as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      script.removeEventListener("load", finish);
      script.removeEventListener("error", finish);
      resolve(Boolean(window.google?.accounts.id));
    };

    const timeout = window.setTimeout(finish, 6000);
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", finish, { once: true });

    if (!existing) {
      script.id = "google-identity-services";
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
}

type RoyaleLensClientProps = {
  initialAccount: Account | null;
  initialGoogleClientId: string | null;
  initialPlayerTag: string | null;
  initialSection: "overview" | "upgrade-queue" | "collection" | null;
};

export default function RoyaleLensClient({
  initialAccount,
  initialGoogleClientId,
  initialPlayerTag,
  initialSection,
}: RoyaleLensClientProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [playerTag, setPlayerTag] = useState(initialPlayerTag ?? "");
  const [filter, setFilter] = useState<CollectionFilter>("All");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("level");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [account, setAccount] = useState<Account | null>(initialAccount);
  const [authLoading, setAuthLoading] = useState(Boolean(initialPlayerTag));
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [defaultPlayerDialogOpen, setDefaultPlayerDialogOpen] = useState(
    Boolean(initialAccount && !initialAccount.defaultPlayerTag && !initialAccount.onboardingDismissed),
  );
  const [defaultPlayerDraft, setDefaultPlayerDraft] = useState("");
  const [defaultPlayerSaving, setDefaultPlayerSaving] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [landingReady, setLandingReady] = useState(!initialGoogleClientId);
  const [profileReady, setProfileReady] = useState(!initialPlayerTag);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [queueLoaded, setQueueLoaded] = useState(false);
  const [queueSaveStatus, setQueueSaveStatus] = useState<QueueSaveStatus>("idle");
  const [queueMessage, setQueueMessage] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<BookmarkedPlayer[]>([]);
  const [bookmarksLoaded, setBookmarksLoaded] = useState(!initialAccount);
  const [bookmarkSavingTag, setBookmarkSavingTag] = useState<string | null>(null);
  const [navigationMenuOpen, setNavigationMenuOpen] = useState(false);
  const [mobileBookmarksOpen, setMobileBookmarksOpen] = useState(false);
  const [moreStatsOpen, setMoreStatsOpen] = useState(false);
  const [rarityBreakdownOpen, setRarityBreakdownOpen] = useState(false);
  const [draggedBookmarkTag, setDraggedBookmarkTag] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<number | null>(null);
  const [draggedCardId, setDraggedCardId] = useState<number | null>(null);
  const queueItemsRef = useRef<QueueItem[]>([]);
  const pendingQueueSaveRef = useRef<QueueItem[] | null>(null);
  const queueSaveInFlightRef = useRef(false);
  const queueDragRef = useRef<{
    cardId: number;
    rarity: Rarity;
    pointerId: number;
    pointerType: string;
    handle: HTMLButtonElement;
    grabOffsetX: number;
  } | null>(null);
  const queueDragCleanupRef = useRef<(() => void) | null>(null);
  const queueLayoutBeforeRef = useRef<Map<number, DOMRect> | null>(null);
  const bookmarksRef = useRef<BookmarkedPlayer[]>([]);
  const pendingBookmarkOrderRef = useRef<string[] | null>(null);
  const bookmarkSaveInFlightRef = useRef(false);
  const bookmarkSingleTapTimerRef = useRef<number | null>(null);
  const bookmarkLastTapRef = useRef<{ playerTag: string; at: number } | null>(null);
  const bookmarkLayoutBeforeRef = useRef<Map<string, DOMRect> | null>(null);
  const bookmarkDragCleanupRef = useRef<(() => void) | null>(null);
  const bookmarkDragFrameRef = useRef<number | null>(null);
  const bookmarkPressRef = useRef<{
    playerTag: string;
    pointerId: number;
    pointerType: string;
    startX: number;
    startY: number;
    button: HTMLButtonElement;
    container: HTMLElement;
    timer: number;
    active: boolean;
    moved: boolean;
    latestY: number;
    grabOffsetY: number;
    ghost: HTMLElement | null;
  } | null>(null);
  const initialSectionRef = useRef(initialSection);

  const collection = useMemo(() => data?.collection ?? [], [data?.collection]);

  const visibleCards = useMemo(() => {
    const filtered = collection.filter((card) => {
      const matchesFilter = filter === "Tower Troops"
        ? card.isTowerTroop
        : !card.isTowerTroop && (
          filter === "All" ||
          (filter === "Evolutions" && card.hasEvolution) ||
          (filter === "Heroes" && card.hasHero) ||
          card.rarity === filter
        );
      const matchesQuery = card.name.toLowerCase().includes(query.trim().toLowerCase());
      return matchesFilter && matchesQuery;
    });

    return filtered.sort((a, b) => {
      if (sortKey === "rarity") {
        const rarityDifference = rarityOrder[a.rarity] - rarityOrder[b.rarity];
        const value = rarityDifference || a.name.localeCompare(b.name);
        return sortDirection === "asc" ? value : -value;
      }
      const aValue = sortKey === "level" ? a.level : a.elixirCost;
      const bValue = sortKey === "level" ? b.level : b.elixirCost;
      if (aValue === null && bValue === null) return a.name.localeCompare(b.name);
      if (aValue === null) return 1;
      if (bValue === null) return -1;
      const value = aValue - bValue;
      return sortDirection === "asc" ? value : -value;
    });
  }, [collection, filter, query, sortDirection, sortKey]);

  const totals = useMemo(() => {
    const total = collection.length;
    const unlocked = collection.filter((card) => card.unlocked).length;
    const maxed = collection.filter(
      (card) => card.unlocked && card.level !== null && card.level >= card.maxLevel,
    ).length;
    const evolutions = collection.filter((card) => card.hasEvolution).length;
    const evolutionsUnlocked = collection.filter((card) => card.evolutionUnlocked).length;
    const heroes = collection.filter((card) => card.hasHero).length;
    const heroesUnlocked = data?.heroOwnershipAvailable
      ? collection.filter((card) => card.heroUnlocked === true).length
      : null;
    const towerTroops = collection.filter((card) => card.isTowerTroop).length;
    const towerTroopsUnlocked = collection.filter((card) => card.isTowerTroop && card.unlocked).length;
    const rarityBreakdown = queueRarities.map((rarity) => {
      const rarityCards = collection.filter((card) => card.rarity === rarity);
      return {
        rarity,
        unlocked: rarityCards.filter((card) => card.unlocked).length,
        total: rarityCards.length,
      };
    });
    return {
      total,
      unlocked,
      maxed,
      locked: total - unlocked,
      evolutions,
      evolutionsUnlocked,
      heroes,
      heroesUnlocked,
      towerTroops,
      towerTroopsUnlocked,
      rarityBreakdown,
    };
  }, [collection, data?.heroOwnershipAvailable]);

  const completion = totals.total ? Math.round((totals.unlocked / totals.total) * 100) : 0;
  const player = data?.player ?? null;
  const playerClanDetails = player?.clan
    ? [player.clan, player.clanRole].filter((detail): detail is string => Boolean(detail)).join(" · ")
    : null;
  const hasSeasonalRoad = Boolean(player && player.trophyRoadTrophies >= 14000);
  const playerArenaDetails = player
    ? hasSeasonalRoad
      ? player.arenaLabel
      : `${player.arenaLabel} · ${player.arena}`
    : null;
  const isGoldProfile = player?.tag.toUpperCase() === GOLD_PLAYER_TAG;
  const currentBookmark = player
    ? bookmarks.find((bookmark) => bookmark.playerTag === player.tag.toUpperCase()) ?? null
    : null;
  const isDefaultProfile = Boolean(
    account?.defaultPlayerTag && player?.tag.toUpperCase() === account.defaultPlayerTag.toUpperCase(),
  );
  const canUseQueue = Boolean(account && isDefaultProfile);
  const draggedCardRarity = draggedCardId === null
    ? null
    : queueItems.find((item) => item.cardId === draggedCardId)?.rarity ?? null;

  const setQueueSnapshot = useCallback((items: QueueItem[]) => {
    const normalizedItems = normalizeQueueItems(items);
    queueItemsRef.current = normalizedItems;
    setQueueItems(normalizedItems);
  }, []);

  // Queue reordering uses FLIP animation: capture positions before a state
  // update, then animate each card from its previous box to its new box.
  const captureQueueLayout = useCallback((rarity: Rarity) => {
    if (queueLayoutBeforeRef.current) return;
    const rail = document.querySelector<HTMLElement>(`[data-queue-rail="${rarity}"]`);
    if (!rail) return;
    const cards = Array.from(rail.querySelectorAll<HTMLElement>("[data-queue-card-id]"));
    cards.forEach((card) => {
      card.getAnimations().find((animation) => animation.id === "queue-reorder")?.cancel();
    });
    queueLayoutBeforeRef.current = new Map(
      cards.map((card) => [
        Number(card.dataset.queueCardId),
        card.getBoundingClientRect(),
      ]),
    );
  }, []);

  useLayoutEffect(() => {
    const previousLayout = queueLayoutBeforeRef.current;
    if (!previousLayout) return;
    queueLayoutBeforeRef.current = null;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const [cardId, previousRect] of previousLayout) {
      if (cardId === draggedCardId) continue;
      const card = document.querySelector<HTMLElement>(`[data-queue-card-id="${cardId}"]`);
      if (!card) continue;
      const nextRect = card.getBoundingClientRect();
      const deltaX = previousRect.left - nextRect.left;
      const deltaY = previousRect.top - nextRect.top;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) continue;
      const animation = card.animate(
        [
          { translate: `${deltaX}px ${deltaY}px` },
          { translate: "0 0" },
        ],
        { duration: 280, easing: "cubic-bezier(.22,1,.36,1)" },
      );
      animation.id = "queue-reorder";
    }
  }, [draggedCardId, queueItems]);

  useEffect(() => () => queueDragCleanupRef.current?.(), []);

  useEffect(() => {
    bookmarksRef.current = bookmarks;
  }, [bookmarks]);

  // Bookmarks use the same FLIP technique vertically inside either menu.
  const captureBookmarkLayout = useCallback((container: HTMLElement) => {
    if (bookmarkLayoutBeforeRef.current) return;
    const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-bookmark-tag]"));
    const visibleLayout = new Map(
      rows.map((row) => [row.dataset.bookmarkTag ?? "", row.getBoundingClientRect()]),
    );
    rows.forEach((row) => {
      row.getAnimations().find((animation) => animation.id === "bookmark-reorder")?.cancel();
    });
    bookmarkLayoutBeforeRef.current = visibleLayout;
  }, []);

  useLayoutEffect(() => {
    const previousLayout = bookmarkLayoutBeforeRef.current;
    if (!previousLayout) return;
    bookmarkLayoutBeforeRef.current = null;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const visibleRows = Array.from(
      document.querySelectorAll<HTMLElement>("[data-bookmark-tag]"),
    ).filter((row) => row.offsetParent !== null);
    for (const [playerTag, previousRect] of previousLayout) {
      if (!playerTag || playerTag === draggedBookmarkTag) continue;
      const row = visibleRows.find((candidate) => candidate.dataset.bookmarkTag === playerTag);
      if (!row) continue;
      const nextRect = row.getBoundingClientRect();
      const deltaY = previousRect.top - nextRect.top;
      if (Math.abs(deltaY) < 1) continue;
      const animation = row.animate(
        [{ translate: `0 ${deltaY}px` }, { translate: "0 0" }],
        { duration: 240, easing: "cubic-bezier(.22,1,.36,1)" },
      );
      animation.id = "bookmark-reorder";
    }
  }, [bookmarks, draggedBookmarkTag]);

  const saveBookmarkOrder = useCallback((orderedBookmarks: BookmarkedPlayer[]) => {
    // Rapid drag updates collapse into the newest snapshot while one request
    // is in flight, preventing an older response from restoring stale order.
    pendingBookmarkOrderRef.current = orderedBookmarks.map((bookmark) => bookmark.playerTag);
    if (bookmarkSaveInFlightRef.current) return;

    const flush = async () => {
      bookmarkSaveInFlightRef.current = true;
      while (pendingBookmarkOrderRef.current) {
        const playerTags = pendingBookmarkOrderRef.current;
        pendingBookmarkOrderRef.current = null;
        try {
          const response = await fetch("/api/bookmarks", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ playerTags }),
          });
          const payload = (await response.json()) as {
            bookmarks?: BookmarkedPlayer[];
            message?: string;
          };
          if (!response.ok || !payload.bookmarks) {
            throw new Error(payload.message || "Your bookmark order could not be saved.");
          }
          if (!pendingBookmarkOrderRef.current) {
            bookmarksRef.current = payload.bookmarks;
            setBookmarks(payload.bookmarks);
          }
        } catch (error) {
          pendingBookmarkOrderRef.current = null;
          setMessage(error instanceof Error ? error.message : "Your bookmark order could not be saved.");
          break;
        }
      }
      bookmarkSaveInFlightRef.current = false;
    };

    void flush();
  }, []);

  useEffect(() => () => {
    bookmarkDragCleanupRef.current?.();
    if (bookmarkSingleTapTimerRef.current !== null) {
      window.clearTimeout(bookmarkSingleTapTimerRef.current);
    }
    const press = bookmarkPressRef.current;
    if (press) window.clearTimeout(press.timer);
  }, []);

  const saveQueue = useCallback((items: QueueItem[]) => {
    // Persist only the latest pending snapshot when users reorder repeatedly.
    pendingQueueSaveRef.current = normalizeQueueItems(items);

    if (queueSaveInFlightRef.current) return;

    const flush = async () => {
      queueSaveInFlightRef.current = true;
      setQueueSaveStatus("saving");
      setQueueMessage(null);

      while (pendingQueueSaveRef.current) {
        const itemsToSave = pendingQueueSaveRef.current;
        pendingQueueSaveRef.current = null;
        try {
          const response = await fetch("/api/upgrade-queue", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: itemsToSave }),
          });
          const payload = (await response.json()) as { message?: string };
          if (!response.ok) throw new Error(payload.message || "Your queue could not be saved.");
        } catch (error) {
          pendingQueueSaveRef.current = null;
          setQueueSaveStatus("error");
          setQueueMessage(error instanceof Error ? error.message : "Your queue could not be saved.");
          queueSaveInFlightRef.current = false;
          return;
        }
      }

      setQueueSaveStatus("saved");
      queueSaveInFlightRef.current = false;
    };

    void flush();
  }, []);

  const fetchPlayer = useCallback(async (tag: string, initialRequest?: Promise<Response>) => {
    setFilter("All");
    setActiveCardId(null);
    setMoreStatsOpen(false);
    setRarityBreakdownOpen(false);

    if (!tag.trim()) {
      setMessage("Enter your player tag first — for example, #ABC123.");
      setIsLoading(false);
      return null;
    }

    setIsLoading(true);
    setMessage(null);
    try {
      const response = await (initialRequest ?? fetch(`/api/player?tag=${encodeURIComponent(tag.trim())}`, {
        cache: "no-store",
      }));
      const payload = (await response.json()) as DashboardData & { message?: string };
      if (!response.ok) {
        throw new Error(payload.message || "We could not load that player.");
      }
      setQueueLoaded(false);
      setQueueMessage(null);
      setQueueSaveStatus("idle");
      setData(payload);
      setPlayerTag(payload.player.tag);
      // Profile changes always reset collection state. A section query is
      // honored once on initial navigation, then removed from the address bar.
      const requestedSection = initialSectionRef.current;
      initialSectionRef.current = null;
      window.requestAnimationFrame(() => {
        const location = new URL(window.location.href);
        if (location.hash || location.searchParams.has("section")) {
          location.hash = "";
          location.searchParams.delete("section");
          window.history.replaceState(null, "", `${location.pathname}${location.search}`);
        }
        window.requestAnimationFrame(() => {
          const target = requestedSection && requestedSection !== "overview"
            ? document.getElementById(requestedSection)
            : null;
          if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
          else window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
        });
      });
      return payload;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialPlayerTag) return;

    let active = true;
    const initialise = async () => {
      const initialRequest = window.__royaleLensInitialProfileRequest;
      window.__royaleLensInitialProfileRequest = undefined;

      try {
        await fetchPlayer(initialPlayerTag, initialRequest);
      } catch {
        if (active) setAuthMessage("Your default player could not be opened automatically.");
      } finally {
        if (active) setAuthLoading(false);
      }
    };
    void initialise();
    return () => { active = false; };
  }, [fetchPlayer, initialPlayerTag]);

  useEffect(() => {
    if (account || !initialGoogleClientId || googleReady) return;

    let active = true;
    void waitForGoogleIdentity().then((ready) => {
      if (!active) return;
      setGoogleReady(ready);
      if (!ready) {
        setLandingReady(true);
        setAuthMessage("Google sign-in is temporarily unavailable. Guest lookup still works.");
      }
    });
    return () => { active = false; };
  }, [account, googleReady, initialGoogleClientId]);

  const markLandingReady = useCallback(() => {
    setLandingReady(true);
  }, []);

  useEffect(() => {
    if (authLoading || !account || !data || profileReady) return;
    const frame = window.requestAnimationFrame(() => setProfileReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, [account, authLoading, data, profileReady]);

  const completeGoogleSignIn = useCallback(async (credential: string) => {
    setAuthMessage(null);
    try {
      const response = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      const payload = (await response.json()) as { account?: Account; message?: string };
      if (!response.ok || !payload.account) throw new Error(payload.message || "Google sign-in could not be completed.");
      setAccount(payload.account);
      if (payload.account.defaultPlayerTag) {
        setProfileReady(false);
        setAuthLoading(true);
        setPlayerTag(payload.account.defaultPlayerTag);
        try {
          await fetchPlayer(payload.account.defaultPlayerTag);
        } finally {
          setAuthLoading(false);
        }
      } else if (!payload.account.onboardingDismissed) {
        setDefaultPlayerDraft("");
        setDefaultPlayerDialogOpen(true);
      }
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Google sign-in could not be completed.");
    }
  }, [fetchPlayer]);

  useEffect(() => {
    if (!data || !canUseQueue) return;

    const controller = new AbortController();

    const loadQueue = async () => {
      try {
        const response = await fetch("/api/upgrade-queue", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as {
          items?: QueueItem[];
          message?: string;
        };
        if (!response.ok || !payload.items) {
          throw new Error(payload.message || "Your Upgrade Queue could not be loaded.");
        }

        const maxedIds = new Set(
          collection
            .filter((card) => card.unlocked && card.level !== null && card.level >= card.maxLevel)
            .map((card) => card.id),
        );
        const collectionIds = new Set(collection.map((card) => card.id));
        const sanitizedItems = normalizeQueueItems(
          payload.items.filter((item) => collectionIds.has(item.cardId) && !maxedIds.has(item.cardId)),
        );

        setQueueSnapshot(sanitizedItems);
        setQueueLoaded(true);

        if (sanitizedItems.length !== payload.items.length) {
          saveQueue(sanitizedItems);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setQueueLoaded(true);
        setQueueSaveStatus("error");
        setQueueMessage(error instanceof Error ? error.message : "Your Upgrade Queue could not be loaded.");
      }
    };

    void loadQueue();
    return () => controller.abort();
  }, [canUseQueue, collection, data, saveQueue, setQueueSnapshot]);

  useEffect(() => {
    if (!account) return;

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
  }, [account]);

  useEffect(() => {
    if (activeCardId === null) return;

    const closeOverlayOutsideCard = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".collection-card.is-queue-open")) return;
      setActiveCardId(null);
    };

    document.addEventListener("pointerdown", closeOverlayOutsideCard);
    return () => document.removeEventListener("pointerdown", closeOverlayOutsideCard);
  }, [activeCardId]);

  function loadPlayer(event: FormEvent) {
    event.preventDefault();
    void fetchPlayer(playerTag);
  }

  function loadHomeProfile() {
    const tag = account?.defaultPlayerTag;
    if (tag) {
      setPlayerTag(tag);
      void fetchPlayer(tag);
    } else {
      setData(null);
      setPlayerTag("");
      setMessage(null);
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    }
  }

  async function saveBookmarkName(loadedPlayer: DashboardData["player"]) {
    try {
      const response = await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerTag: loadedPlayer.tag, playerName: loadedPlayer.name }),
      });
      const payload = (await response.json()) as {
        bookmarks?: BookmarkedPlayer[];
        message?: string;
      };
      if (response.ok && payload.bookmarks) setBookmarks(payload.bookmarks);
    } catch {
      // The live profile is still usable if its cached bookmark name cannot be refreshed.
    }
  }

  function moveDraggedBookmark(playerTag: string, targetIndex: number, container: HTMLElement) {
    if (playerTag === GOLD_PLAYER_TAG) return;
    const current = bookmarksRef.current;
    const currentIndex = current.findIndex((bookmark) => bookmark.playerTag === playerTag);
    const firstMovableIndex = current[0]?.playerTag === GOLD_PLAYER_TAG ? 1 : 0;
    const boundedTarget = Math.max(firstMovableIndex, Math.min(current.length - 1, targetIndex));
    if (currentIndex < 0 || currentIndex === boundedTarget) return;

    captureBookmarkLayout(container);
    const next = [...current];
    const [moved] = next.splice(currentIndex, 1);
    next.splice(boundedTarget, 0, moved);
    const positioned = next.map((bookmark, position) => ({ ...bookmark, position }));
    bookmarksRef.current = positioned;
    setBookmarks(positioned);
  }

  function documentLayoutTop(element: HTMLElement) {
    let top = 0;
    let current: HTMLElement | null = element;
    while (current) {
      top += current.offsetTop;
      current = current.offsetParent as HTMLElement | null;
    }
    return top;
  }

  function reorderBookmarkAtY(pointerY: number) {
    const press = bookmarkPressRef.current;
    if (!press?.active) return;
    const rows = Array.from(
      press.container.querySelectorAll<HTMLElement>("[data-bookmark-tag]"),
    );
    if (rows.length < 2) return;

    const containerBounds = press.container.getBoundingClientRect();
    const pointerContentY = pointerY - containerBounds.top + press.container.scrollTop;
    const containerLayoutTop = documentLayoutTop(press.container);
    let targetIndex = rows.length - 1;
    for (let index = 0; index < rows.length; index += 1) {
      const rowTop = documentLayoutTop(rows[index]) - containerLayoutTop;
      if (pointerContentY < rowTop + rows[index].offsetHeight / 2) {
        targetIndex = index;
        break;
      }
    }
    moveDraggedBookmark(press.playerTag, targetIndex, press.container);

    const edge = Math.min(44, containerBounds.height * 0.17);
    const previousScrollTop = press.container.scrollTop;
    if (pointerY < containerBounds.top + edge) {
      press.container.scrollTop -= 7;
    } else if (pointerY > containerBounds.bottom - edge) {
      press.container.scrollTop += 7;
    }
    if (press.container.scrollTop !== previousScrollTop) scheduleBookmarkDragFrame();
  }

  function scheduleBookmarkDragFrame() {
    if (bookmarkDragFrameRef.current !== null) return;
    bookmarkDragFrameRef.current = window.requestAnimationFrame(() => {
      bookmarkDragFrameRef.current = null;
      const press = bookmarkPressRef.current;
      if (press?.active) reorderBookmarkAtY(press.latestY);
    });
  }

  function continueBookmarkDrag(event: PointerEvent) {
    const press = bookmarkPressRef.current;
    if (!press?.active || event.pointerId !== press.pointerId) return;
    event.preventDefault();
    press.latestY = event.clientY;
    if (press.ghost) {
      press.ghost.style.top = `${event.clientY - press.grabOffsetY}px`;
    }
    scheduleBookmarkDragFrame();
  }

  function settleBookmarkGhost(press: NonNullable<typeof bookmarkPressRef.current>) {
    const ghost = press.ghost;
    if (!ghost) {
      setDraggedBookmarkTag(null);
      return;
    }
    press.ghost = null;
    const target = Array.from(
      document.querySelectorAll<HTMLElement>("[data-bookmark-tag]"),
    ).find((row) => row.offsetParent !== null && row.dataset.bookmarkTag === press.playerTag);
    if (!target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      ghost.remove();
      setDraggedBookmarkTag(null);
      return;
    }

    const from = ghost.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const animation = ghost.animate(
      [
        { transform: "translate3d(0,0,0)", opacity: 1 },
        { transform: `translate3d(${to.left - from.left}px,${to.top - from.top}px,0)`, opacity: .72 },
      ],
      { duration: 170, easing: "cubic-bezier(.22,1,.36,1)" },
    );
    void animation.finished.finally(() => {
      ghost.remove();
      setDraggedBookmarkTag(null);
    });
  }

  function finishBookmarkDrag(event: PointerEvent) {
    const press = bookmarkPressRef.current;
    if (!press?.active || event.pointerId !== press.pointerId) return;
    event.preventDefault();
    const finalY = event.type === "pointercancel" ? press.latestY : event.clientY;
    press.latestY = finalY;
    if (bookmarkDragFrameRef.current !== null) {
      window.cancelAnimationFrame(bookmarkDragFrameRef.current);
      bookmarkDragFrameRef.current = null;
    }
    reorderBookmarkAtY(finalY);
    if (press.button.hasPointerCapture(event.pointerId)) {
      press.button.releasePointerCapture(event.pointerId);
    }
    const ghost = press.ghost;
    press.ghost = null;
    bookmarkDragCleanupRef.current?.();
    press.ghost = ghost;
    bookmarkPressRef.current = null;
    saveBookmarkOrder(bookmarksRef.current);
    window.requestAnimationFrame(() => settleBookmarkGhost(press));
  }

  function activateBookmarkDrag(playerTag: string, pointerId: number) {
    const press = bookmarkPressRef.current;
    if (!press || press.playerTag !== playerTag || press.pointerId !== pointerId || press.moved) return;
    const bounds = press.button.getBoundingClientRect();
    const ghost = press.button.cloneNode(true) as HTMLElement;
    ghost.removeAttribute("data-bookmark-tag");
    ghost.removeAttribute("id");
    ghost.setAttribute("aria-hidden", "true");
    ghost.setAttribute("tabindex", "-1");
    ghost.classList.remove("is-dragging");
    ghost.classList.add("bookmark-drag-ghost");
    ghost.style.left = `${bounds.left}px`;
    ghost.style.top = `${bounds.top}px`;
    ghost.style.width = `${bounds.width}px`;
    ghost.style.height = `${bounds.height}px`;
    document.body.appendChild(ghost);

    press.active = true;
    press.latestY = press.startY;
    press.grabOffsetY = press.startY - bounds.top;
    press.ghost = ghost;
    setDraggedBookmarkTag(playerTag);
    document.body.classList.add("is-bookmark-reordering");

    const move = (event: PointerEvent) => continueBookmarkDrag(event);
    const finish = (event: PointerEvent) => finishBookmarkDrag(event);
    const blockTouchScroll = (event: TouchEvent) => event.preventDefault();
    const blockContextMenu = (event: MouseEvent) => event.preventDefault();
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish, { passive: false });
    window.addEventListener("pointercancel", finish, { passive: false });
    window.addEventListener("touchmove", blockTouchScroll, { passive: false, capture: true });
    window.addEventListener("contextmenu", blockContextMenu, { capture: true });
    bookmarkDragCleanupRef.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("touchmove", blockTouchScroll, true);
      window.removeEventListener("contextmenu", blockContextMenu, true);
      if (bookmarkDragFrameRef.current !== null) {
        window.cancelAnimationFrame(bookmarkDragFrameRef.current);
        bookmarkDragFrameRef.current = null;
      }
      const activePress = bookmarkPressRef.current;
      if (activePress?.ghost) activePress.ghost.remove();
      document.body.classList.remove("is-bookmark-reordering");
      bookmarkDragCleanupRef.current = null;
    };
  }

  function beginBookmarkPress(
    event: React.PointerEvent<HTMLButtonElement>,
    bookmark: BookmarkedPlayer,
  ) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const container = event.currentTarget.closest<HTMLElement>(
      ".bookmarks-submenu, .mobile-bookmarks-list",
    );
    if (!container) return;

    const previousPress = bookmarkPressRef.current;
    if (previousPress) window.clearTimeout(previousPress.timer);
    bookmarkDragCleanupRef.current?.();
    const now = event.timeStamp;
    const isSecondTap = bookmarkLastTapRef.current?.playerTag === bookmark.playerTag
      && now - bookmarkLastTapRef.current.at <= 340;
    if (isSecondTap && bookmarkSingleTapTimerRef.current !== null) {
      window.clearTimeout(bookmarkSingleTapTimerRef.current);
      bookmarkSingleTapTimerRef.current = null;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    const pointerId = event.pointerId;
    // A long press starts immediately; a double tap shortens the hold delay.
    // Normal single taps still open the bookmarked profile.
    const canReorder = bookmark.playerTag !== GOLD_PLAYER_TAG;
    const timer = canReorder
      ? window.setTimeout(
          () => activateBookmarkDrag(bookmark.playerTag, pointerId),
          isSecondTap ? 140 : 460,
        )
      : 0;
    bookmarkPressRef.current = {
      playerTag: bookmark.playerTag,
      pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      button: event.currentTarget,
      container,
      timer,
      active: false,
      moved: false,
      latestY: event.clientY,
      grabOffsetY: 0,
      ghost: null,
    };
  }

  function trackBookmarkPress(event: React.PointerEvent<HTMLButtonElement>) {
    const press = bookmarkPressRef.current;
    if (!press || press.pointerId !== event.pointerId || press.active) return;
    if (Math.hypot(event.clientX - press.startX, event.clientY - press.startY) > 8) {
      press.moved = true;
      window.clearTimeout(press.timer);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      bookmarkPressRef.current = null;
    }
  }

  function completeBookmarkPress(
    event: React.PointerEvent<HTMLButtonElement>,
    bookmark: BookmarkedPlayer,
  ) {
    const press = bookmarkPressRef.current;
    if (!press || press.pointerId !== event.pointerId || press.active) return;
    window.clearTimeout(press.timer);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    bookmarkPressRef.current = null;
    if (press.moved) return;

    bookmarkLastTapRef.current = { playerTag: bookmark.playerTag, at: event.timeStamp };
    if (bookmarkSingleTapTimerRef.current !== null) {
      window.clearTimeout(bookmarkSingleTapTimerRef.current);
    }
    bookmarkSingleTapTimerRef.current = window.setTimeout(() => {
      bookmarkSingleTapTimerRef.current = null;
      void loadBookmarkedPlayer(bookmark);
    }, 340);
  }

  function cancelBookmarkPress(event: React.PointerEvent<HTMLButtonElement>) {
    const press = bookmarkPressRef.current;
    if (!press || press.pointerId !== event.pointerId || press.active) return;
    window.clearTimeout(press.timer);
    bookmarkPressRef.current = null;
  }

  function openBookmarkFromKeyboard(
    event: React.KeyboardEvent<HTMLButtonElement>,
    bookmark: BookmarkedPlayer,
  ) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    void loadBookmarkedPlayer(bookmark);
  }

  async function loadBookmarkedPlayer(bookmark: BookmarkedPlayer) {
    setNavigationMenuOpen(false);
    setMobileBookmarksOpen(false);
    setPlayerTag(bookmark.playerTag);
    const loaded = await fetchPlayer(bookmark.playerTag);
    if (loaded && loaded.player.name !== bookmark.playerName) {
      void saveBookmarkName(loaded.player);
    }
  }

  async function toggleCurrentBookmark() {
    if (!account || !player || bookmarkSavingTag) return;

    setBookmarkSavingTag(player.tag);
    setMessage(null);
    try {
      const response = currentBookmark
        ? await fetch(`/api/bookmarks?tag=${encodeURIComponent(player.tag)}`, { method: "DELETE" })
        : await fetch("/api/bookmarks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ playerTag: player.tag, playerName: player.name }),
          });
      const payload = (await response.json()) as {
        bookmarks?: BookmarkedPlayer[];
        message?: string;
      };
      if (!response.ok || !payload.bookmarks) {
        throw new Error(payload.message || "That bookmark could not be updated.");
      }
      setBookmarks(payload.bookmarks);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That bookmark could not be updated.");
    } finally {
      setBookmarkSavingTag(null);
    }
  }

  async function saveDefaultPlayer(event: FormEvent) {
    event.preventDefault();
    setDefaultPlayerSaving(true);
    setAuthMessage(null);
    try {
      const response = await fetch("/api/account/default-player", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerTag: defaultPlayerDraft }),
      });
      const payload = (await response.json()) as { account?: Account; message?: string };
      if (!response.ok || !payload.account) throw new Error(payload.message || "Your default player could not be saved.");
      setAccount(payload.account);
      setDefaultPlayerDialogOpen(false);
      setPlayerTag(payload.account.defaultPlayerTag ?? "");
      if (payload.account.defaultPlayerTag) await fetchPlayer(payload.account.defaultPlayerTag);
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Your default player could not be saved.");
    } finally {
      setDefaultPlayerSaving(false);
    }
  }

  async function dismissDefaultPlayerPrompt() {
    setDefaultPlayerDialogOpen(false);
    if (!account || account.onboardingDismissed) return;
    setAccount({ ...account, onboardingDismissed: true });
    try {
      await fetch("/api/account/default-player", { method: "PATCH" });
    } catch {
      // The prompt stays dismissed for this visit even if the preference cannot be saved.
    }
  }

  function openDefaultPlayerEditor() {
    setDefaultPlayerDraft(account?.defaultPlayerTag ?? "");
    setAuthMessage(null);
    setDefaultPlayerDialogOpen(true);
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.google?.accounts.id.cancel();
      setAccount(null);
      setData(null);
      setPlayerTag("");
      setMessage(null);
      setFilter("All");
      setActiveCardId(null);
      setQueueItems([]);
      setQueueLoaded(false);
      setBookmarks([]);
      setBookmarksLoaded(true);
      setBookmarkSavingTag(null);
      setProfileReady(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  const queuedCardIds = useMemo(
    () => new Set(queueItems.map((item) => item.cardId)),
    [queueItems],
  );

  function showCollectionFilter(nextFilter: CollectionFilter) {
    setFilter(nextFilter);
    setActiveCardId(null);
    window.requestAnimationFrame(() => {
      document.getElementById("collection")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function showQueuedCard(card: CollectionCard) {
    setActiveCardId(null);

    window.requestAnimationFrame(() => {
      const queueCard = document.getElementById(`queue-card-${card.id}`);
      const lane = queueCard?.closest<HTMLElement>(".queue-lane");
      const rail = queueCard?.closest<HTMLElement>(".queue-card-rail");
      if (!queueCard || !lane || !rail) return;

      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const behavior: ScrollBehavior = reduceMotion ? "auto" : "smooth";
      const laneTop = window.scrollY + lane.getBoundingClientRect().top - 18;

      // Move the page only on the vertical axis. The queue rail owns the
      // horizontal movement so edge cards cannot shift the whole website.
      window.scrollTo({
        top: Math.max(0, laneTop),
        left: window.scrollX,
        behavior,
      });

      const cardBounds = queueCard.getBoundingClientRect();
      const railBounds = rail.getBoundingClientRect();
      const centeredLeft = rail.scrollLeft
        + cardBounds.left
        - railBounds.left
        - (rail.clientWidth - cardBounds.width) / 2;
      rail.scrollTo({ left: Math.max(0, centeredLeft), behavior });
    });
  }

  function addCardToQueue(card: CollectionCard) {
    if (!canUseQueue || !queueLoaded || queuedCardIds.has(card.id)) return;
    const isMaxed = card.unlocked && card.level !== null && card.level >= card.maxLevel;
    const laneItems = queueItemsRef.current.filter((item) => item.rarity === card.rarity);
    if (!card.unlocked || isMaxed || laneItems.length >= queueLimits[card.rarity]) return;

    const nextItems = normalizeQueueItems([
      ...queueItemsRef.current,
      { cardId: card.id, rarity: card.rarity, position: laneItems.length },
    ]);
    setQueueSnapshot(nextItems);
    saveQueue(nextItems);
  }

  function removeCardFromQueue(cardId: number) {
    const nextItems = normalizeQueueItems(queueItemsRef.current.filter((item) => item.cardId !== cardId));
    setQueueSnapshot(nextItems);
    saveQueue(nextItems);
  }

  function moveQueueCard(rarity: Rarity, cardId: number, direction: -1 | 1) {
    const laneItems = queueItemsRef.current
      .filter((item) => item.rarity === rarity)
      .sort((left, right) => left.position - right.position);
    const currentIndex = laneItems.findIndex((item) => item.cardId === cardId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= laneItems.length) return;
    captureQueueLayout(rarity);
    const nextItems = reorderQueueItem(queueItemsRef.current, rarity, cardId, targetIndex, queueRarities) as QueueItem[];
    setQueueSnapshot(nextItems);
    saveQueue(nextItems);
  }

  function moveDraggedCard(rarity: Rarity, cardId: number, targetIndex: number) {
    const laneItems = queueItemsRef.current
      .filter((item) => item.rarity === rarity)
      .sort((left, right) => left.position - right.position);
    const currentIndex = laneItems.findIndex((item) => item.cardId === cardId);
    if (currentIndex < 0 || currentIndex === targetIndex) return;
    captureQueueLayout(rarity);
    const nextItems = reorderQueueItem(queueItemsRef.current, rarity, cardId, targetIndex, queueRarities) as QueueItem[];
    setQueueSnapshot(nextItems);
  }

  function beginQueueDrag(event: React.PointerEvent<HTMLButtonElement>, cardId: number, rarity: Rarity) {
    event.preventDefault();
    event.stopPropagation();
    const queueCard = event.currentTarget.closest<HTMLElement>("[data-queue-card-id]");
    const cardBounds = queueCard?.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    queueDragCleanupRef.current?.();
    queueDragRef.current = {
      cardId,
      rarity,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      handle: event.currentTarget,
      grabOffsetX: cardBounds ? event.clientX - (cardBounds.left + cardBounds.width / 2) : 0,
    };
    setDraggedCardId(cardId);

    const move = (pointerEvent: PointerEvent) => continueQueueDrag(pointerEvent);
    const finish = (pointerEvent: PointerEvent) => finishQueueDrag(pointerEvent);
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    queueDragCleanupRef.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      queueDragCleanupRef.current = null;
    };
  }

  function continueQueueDrag(event: PointerEvent) {
    const drag = queueDragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();

    const rail = document.querySelector<HTMLElement>(`[data-queue-rail="${drag.rarity}"]`);
    if (!rail) return;
    const list = rail.querySelector<HTMLElement>(".queue-card-list");
    const cards = Array.from(rail.querySelectorAll<HTMLElement>("[data-queue-card-id]"));
    if (!list) return;
    if (cards.length < 2) return;

    const listBounds = list.getBoundingClientRect();
    const gap = Number.parseFloat(window.getComputedStyle(list).columnGap) || 0;
    const cardWidth = cards[0].offsetWidth;
    const adjustedPointerX = event.clientX - drag.grabOffsetX;
    const targetIndex = getQueueTargetIndex(
      adjustedPointerX,
      listBounds.left,
      cardWidth,
      gap,
      cards.length,
    );
    const laneItems = queueItemsRef.current
      .filter((item) => item.rarity === drag.rarity)
      .sort((left, right) => left.position - right.position);
    const currentIndex = laneItems.findIndex((item) => item.cardId === drag.cardId);
    const slotWidth = cardWidth + gap;
    const pointerSlot = (adjustedPointerX - listBounds.left - cardWidth / 2) / slotWidth;
    const isTouchDrag = drag.pointerType !== "mouse";
    const reorderThreshold = isTouchDrag ? 0.58 : 0.5;
    const crossedRightBoundary = targetIndex > currentIndex && pointerSlot >= currentIndex + reorderThreshold;
    const crossedLeftBoundary = targetIndex < currentIndex && pointerSlot <= currentIndex - reorderThreshold;
    if (currentIndex >= 0 && (crossedRightBoundary || crossedLeftBoundary)) {
      moveDraggedCard(drag.rarity, drag.cardId, targetIndex);
    }

    const railBounds = rail.getBoundingClientRect();
    const edgeSize = isTouchDrag ? Math.min(36, railBounds.width * 0.12) : 42;
    if (event.clientX < railBounds.left + edgeSize) {
      const strength = (railBounds.left + edgeSize - event.clientX) / edgeSize;
      rail.scrollLeft -= isTouchDrag ? Math.ceil(2 + Math.min(1, strength) * 4) : 10;
    }
    if (event.clientX > railBounds.right - edgeSize) {
      const strength = (event.clientX - (railBounds.right - edgeSize)) / edgeSize;
      rail.scrollLeft += isTouchDrag ? Math.ceil(2 + Math.min(1, strength) * 4) : 10;
    }
  }

  function finishQueueDrag(event: PointerEvent) {
    const drag = queueDragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (drag.handle.hasPointerCapture(event.pointerId)) {
      drag.handle.releasePointerCapture(event.pointerId);
    }
    queueDragCleanupRef.current?.();
    queueDragRef.current = null;
    setDraggedCardId(null);
    saveQueue(queueItemsRef.current);
  }


  const accountDialogs = (
      <Dialog
        open={defaultPlayerDialogOpen}
        onOpenChange={(open) => {
          if (open) setDefaultPlayerDialogOpen(true);
          else void dismissDefaultPlayerPrompt();
        }}
      >
        <DialogContent className="account-dialog default-player-dialog">
          <DialogHeader>
            <span className="dialog-mark"><UserRound size={20} /></span>
            <DialogTitle>{account?.defaultPlayerTag ? "Edit default player" : "Add your default player"}</DialogTitle>
            <DialogDescription>
              This profile opens automatically after sign-in and owns your private Upgrade Queue. You can skip this and add it later in Settings.
            </DialogDescription>
          </DialogHeader>
          <form className="default-player-form" onSubmit={saveDefaultPlayer}>
            <label htmlFor="default-player-tag">Player tag</label>
            <Input
              id="default-player-tag"
              value={defaultPlayerDraft}
              onChange={(event) => setDefaultPlayerDraft(event.target.value.toUpperCase())}
              placeholder="#ABC123"
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />
            {authMessage && <p className="account-message" role="alert">{authMessage}</p>}
            <Button type="submit" disabled={defaultPlayerSaving || !defaultPlayerDraft.trim()}>
              {defaultPlayerSaving ? <RefreshCw className="animate-spin" size={16} /> : <Check size={16} />}
              {defaultPlayerSaving ? "Saving" : "Save default player"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
  );

  if (authLoading) {
    return (
      <main className="arena-shell app-boot">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />
        <div className="boot-mark"><BrandCrown size={24} /><span>Royale Lens</span></div>
        <div className="boot-status"><RefreshCw className="animate-spin" size={18} /> Opening your lens…</div>
      </main>
    );
  }

  if (!account && !data) {
    return (
      <main className={`arena-shell landing-shell ${landingReady ? "is-ready" : "is-preparing"}`}>
        <div
          className={`landing-preflight landing-initial-preflight ${landingReady ? "is-dismissed" : ""}`}
          role="status"
          aria-live="polite"
          aria-hidden={landingReady}
        >
          <div className="boot-mark"><BrandCrown size={24} /><span>Royale Lens</span></div>
          <div className="boot-status"><RefreshCw className="animate-spin" size={18} /> Preparing your lens…</div>
        </div>
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />
        <header className="topbar landing-topbar">
          <button className="brand brand-button" type="button" aria-label="Royale Lens home">
            <span className="brand-mark"><BrandCrown size={21} /></span>
            <span className="brand-name">Royale Lens</span>
          </button>
        </header>

        <section className="landing-page">
          <div className="landing-stage">
            <div className="landing-copy">
              <span className="landing-kicker"><Sparkles size={14} /> Live Clash Royale player intelligence</span>
              <h1>Your account,<br /><em>in sharper focus.</em></h1>
              <p>Inspect any player instantly, explore every card, and sign in whenever you want your personal Upgrade Queue synchronized across devices.</p>
            </div>

            <div className="landing-actions">
              <div className="landing-card-heading">
                <span className="landing-card-icon"><Search size={19} /></span>
                <div>
                  <span>Live player lookup</span>
                  <h2>Open any profile</h2>
                </div>
              </div>

              <form className="guest-lookup" onSubmit={loadPlayer}>
                <div>
                  <label htmlFor="guest-player-tag">Player tag</label>
                  <span>No sign-in needed</span>
                </div>
                <div className="guest-search-control">
                  <Search size={18} />
                  <input
                    id="guest-player-tag"
                    value={playerTag}
                    onChange={(event) => setPlayerTag(event.target.value.toUpperCase())}
                    placeholder="#PLAYER TAG"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button type="submit" disabled={isLoading}>
                    {isLoading ? <RefreshCw className="animate-spin" size={17} /> : <ArrowUp size={17} />}
                    <span>{isLoading ? "Loading" : "Inspect"}</span>
                  </button>
                </div>
                {message && <p className="form-message" role="alert">{message}</p>}
              </form>

              <div className="landing-divider"><span>or continue with your account</span></div>
              {initialGoogleClientId && googleReady ? (
                <GoogleSignInButton
                  clientId={initialGoogleClientId}
                  onCredential={completeGoogleSignIn}
                  onPainted={markLandingReady}
                />
              ) : (
                <div className="google-button-frame" aria-label="Loading Google sign-in" />
              )}
              <p className="landing-account-note">Sign in to open your default player automatically and keep your Upgrade Queue in sync.</p>
              {authMessage && <p className="account-message" role="alert">{authMessage}</p>}
            </div>
          </div>
        </section>
        <footer className="landing-footer">
          <span>Royale Lens</span>
          <p>Not affiliated with Supercell. Game data is supplied by the official Clash Royale API.</p>
        </footer>
        {accountDialogs}
      </main>
    );
  }

  return (
    <main className="arena-shell">
      <div
        className={`landing-preflight profile-preflight ${profileReady ? "is-dismissed" : ""}`}
        role="status"
        aria-live="polite"
        aria-hidden={profileReady}
      >
        <div className="boot-mark"><BrandCrown size={24} /><span>Royale Lens</span></div>
        <div className="boot-status"><RefreshCw className="animate-spin" size={18} /> Opening your lens…</div>
      </div>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="topbar">
        <button
          className="brand brand-button"
          type="button"
          aria-label={account?.defaultPlayerTag ? `Load ${account.defaultPlayerTag} in Royale Lens` : "Royale Lens home"}
          onClick={loadHomeProfile}
        >
          <span className="brand-mark"><BrandCrown size={21} /></span>
          <span className="brand-name">Royale Lens</span>
        </button>

        <DropdownMenu open={navigationMenuOpen} onOpenChange={setNavigationMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button className="navigation-menu-button" type="button" aria-label="Open navigation menu">
              <Menu size={22} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="navigation-menu"
            align="end"
            sideOffset={10}
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            {account && (
              <>
                <DropdownMenuLabel className="navigation-account">
                  <span className="navigation-avatar">
                    {account.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={account.avatarUrl} alt="" referrerPolicy="no-referrer" />
                    ) : <UserRound size={16} />}
                  </span>
                  <span><strong>{account.name}</strong><small>{account.defaultPlayerTag ?? "No default player"}</small></span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
              </>
            )}
            {data ? (
              <DropdownMenuItem asChild>
                <a href="#overview"><BarChart3 size={17} /> Overview</a>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem disabled><BarChart3 size={17} /> Overview</DropdownMenuItem>
            )}
            {canUseQueue ? (
              <DropdownMenuItem asChild>
                <a href="#upgrade-queue"><ListOrdered size={17} /> Upgrade Queue</a>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem disabled title="Available while viewing your default player">
                <LockKeyhole size={17} /> Upgrade Queue <span className="navigation-locked">Default only</span>
              </DropdownMenuItem>
            )}
            {data ? (
              <DropdownMenuItem asChild>
                <a href="#collection"><Layers3 size={17} /> Collection</a>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem disabled><Layers3 size={17} /> Collection</DropdownMenuItem>
            )}
            {account ? (
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
                      bookmarks.map((bookmark) => {
                        const isGoldBookmark = bookmark.playerTag === GOLD_PLAYER_TAG;
                        return (
                          <DropdownMenuItem
                            key={bookmark.playerTag}
                            asChild
                            onSelect={(event) => event.preventDefault()}
                          >
                            <button
                              className={`bookmark-player-item ${draggedBookmarkTag === bookmark.playerTag ? "is-dragging" : ""}`}
                              type="button"
                              data-bookmark-tag={bookmark.playerTag}
                              onPointerDown={(event) => beginBookmarkPress(event, bookmark)}
                              onPointerMove={trackBookmarkPress}
                              onPointerUp={(event) => completeBookmarkPress(event, bookmark)}
                              onPointerCancel={cancelBookmarkPress}
                              onKeyDown={(event) => openBookmarkFromKeyboard(event, bookmark)}
                            >
                              <span className="bookmark-player-copy">
                                <strong className={isGoldBookmark ? "gold-player-name" : ""}>
                                  {bookmark.playerName}
                                </strong>
                                <small>{bookmark.playerTag}</small>
                              </span>
                              <ChevronRight size={16} aria-hidden="true" />
                            </button>
                          </DropdownMenuItem>
                        );
                      })
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
              <DropdownMenuItem disabled title="Sign in to bookmark players">
                <LockKeyhole size={17} /> Bookmarked <span className="navigation-locked">Sign in</span>
              </DropdownMenuItem>
            )}
            {player ? (
              <DropdownMenuItem asChild>
                <a href={`/battles?tag=${encodeURIComponent(player.tag)}`}><Swords size={17} /> Battles</a>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem disabled><Swords size={17} /> Battles</DropdownMenuItem>
            )}
            <DropdownMenuItem disabled>
              <GalleryVerticalEnd size={17} /> Decks <span className="navigation-soon">Soon</span>
            </DropdownMenuItem>
            {account && (
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
              bookmarks.map((bookmark) => {
                const isGoldBookmark = bookmark.playerTag === GOLD_PLAYER_TAG;
                return (
                  <button
                    className={`mobile-bookmark-player ${draggedBookmarkTag === bookmark.playerTag ? "is-dragging" : ""}`}
                    key={bookmark.playerTag}
                    type="button"
                    data-bookmark-tag={bookmark.playerTag}
                    onPointerDown={(event) => beginBookmarkPress(event, bookmark)}
                    onPointerMove={trackBookmarkPress}
                    onPointerUp={(event) => completeBookmarkPress(event, bookmark)}
                    onPointerCancel={cancelBookmarkPress}
                    onKeyDown={(event) => openBookmarkFromKeyboard(event, bookmark)}
                  >
                    <span className="bookmark-player-copy">
                      <strong className={isGoldBookmark ? "gold-player-name" : ""}>
                        {bookmark.playerName}
                      </strong>
                      <small>{bookmark.playerTag}</small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={moreStatsOpen}
        onOpenChange={(open) => {
          setMoreStatsOpen(open);
          if (!open) setRarityBreakdownOpen(false);
        }}
      >
        <DialogContent className="player-stats-dialog">
          <DialogHeader className="player-stats-header">
            <span className="player-stats-mark"><BarChart3 size={20} /></span>
            <div>
              <DialogTitle>Player Statistics</DialogTitle>
              <DialogDescription>
                {player ? (
                  <>
                    <span className={isGoldProfile ? "gold-player-name" : ""}>{player.name}</span>
                    <span aria-hidden="true"> · </span>
                    <span>{player.tag}</span>
                  </>
                ) : "Live player statistics"}
              </DialogDescription>
            </div>
          </DialogHeader>
          {player && (
            <div className="player-stats-scroll">
              <div className="player-stats-grid">
                <StatsGroup
                  icon={<Activity size={17} />}
                  title="Battle Stats"
                  rows={[
                    { label: "Wins", value: formatNumber(player.wins) },
                    { label: "Losses", value: formatOptionalNumber(player.statistics?.losses) },
                    { label: "Total battles", value: formatNumber(player.battleCount) },
                    {
                      label: "Win rate",
                      value: player.statistics?.losses !== null && player.statistics?.losses !== undefined && player.wins + player.statistics.losses > 0
                        ? `${((player.wins / (player.wins + player.statistics.losses)) * 100).toFixed(1)}%`
                        : "—",
                    },
                    {
                      label: "Loss rate",
                      value: player.statistics?.losses !== null && player.statistics?.losses !== undefined && player.wins + player.statistics.losses > 0
                        ? `${((player.statistics.losses / (player.wins + player.statistics.losses)) * 100).toFixed(1)}%`
                        : "—",
                    },
                    { label: "Three-crown wins", value: formatOptionalNumber(player.statistics?.threeCrownWins) },
                  ]}
                />
                <StatsGroup
                  icon={<Medal size={17} />}
                  title="Ranked Stats"
                  rows={[
                    { label: "Current Season League", value: formatLeague(player.statistics?.currentRankedSeason?.leagueNumber ?? player.leagueNumber) },
                    {
                      label: "Current League Medals",
                      value: formatMedalsWithRank(
                        player.statistics?.currentRankedSeason?.medals ?? player.leagueMedals,
                        player.statistics?.currentRankedSeason?.rank ?? player.leagueRank,
                      ),
                    },
                    { label: "Last Season League", value: formatLeague(player.statistics?.lastRankedSeason?.leagueNumber) },
                    {
                      label: "Last Season League Medals",
                      value: formatMedalsWithRank(
                        player.statistics?.lastRankedSeason?.medals,
                        player.statistics?.lastRankedSeason?.rank,
                      ),
                    },
                    { label: "Best Season League", value: formatLeague(player.statistics?.bestRankedSeason?.leagueNumber) },
                    {
                      label: "Best Season League Medals",
                      value: formatMedalsWithRank(
                        player.statistics?.bestRankedSeason?.medals,
                        player.statistics?.bestRankedSeason?.rank,
                      ),
                    },
                  ]}
                />
                <StatsGroup
                  icon={<Layers3 size={17} />}
                  title="Collection Stats"
                  rows={[
                    {
                      label: "Cards unlocked",
                      value: `${totals.unlocked} / ${totals.total}`,
                      onSelect: () => setRarityBreakdownOpen((open) => !open),
                      expanded: rarityBreakdownOpen,
                      controls: "rarity-breakdown-inline",
                      detail: (
                        <div className="rarity-breakdown-inline" id="rarity-breakdown-inline">
                          <div className="rarity-breakdown-heading">
                            <strong>Unlocked By Rarity</strong>
                          </div>
                          <RarityBreakdown items={totals.rarityBreakdown} />
                        </div>
                      ),
                    },
                    { label: "Cards maxed", value: formatNumber(totals.maxed) },
                    { label: "Collection complete", value: `${completion}%` },
                    { label: "Evolutions", value: `${totals.evolutionsUnlocked} / ${totals.evolutions}` },
                    { label: "Heroes", value: totals.heroesUnlocked === null ? `— / ${totals.heroes}` : `${totals.heroesUnlocked} / ${totals.heroes}` },
                    { label: "Tower Troops", value: `${totals.towerTroopsUnlocked} / ${totals.towerTroops}` },
                    { label: "Emotes collected", value: formatOptionalNumber(player.statistics?.emotesCollected) },
                  ]}
                />
                <StatsGroup
                  icon={<Star size={17} />}
                  title="Profile Stats"
                  rows={[
                    { label: "Experience", value: `Level ${formatNumber(player.expLevel)}` },
                    { label: "Collection Level", value: formatNumber(player.collectionLevel) },
                    { label: "King Level", value: `Level ${formatNumber(player.kingTowerLevel)}` },
                    { label: "Star points", value: formatOptionalNumber(player.statistics?.starPoints) },
                    { label: "Current trophies", value: formatNumber(player.trophies) },
                    {
                      label: "Best trophies",
                      value: formatNumber(player.bestTrophies),
                      info: player.trophyRoadTrophies >= 14000 ? <BestTrophiesInfo /> : undefined,
                    },
                    { label: "Arena", value: playerArenaDetails ?? player.arenaLabel },
                    { label: "Clan", value: player.clan ?? "No clan" },
                    { label: "Total donations", value: formatOptionalNumber(player.statistics?.totalDonations) },
                    { label: "Account Age", value: formatAccountAge(player.statistics?.accountAgeDays) },
                  ]}
                />
              </div>
              <p className="player-stats-source">Live statistics supplied by the official Clash Royale API.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <section className="dashboard" id="top">
        <section className="hero-panel" id="overview">
          <button
            className={`profile-bookmark-button ${currentBookmark ? "is-bookmarked" : ""} ${bookmarkSavingTag === player?.tag ? "is-saving" : ""}`}
            type="button"
            disabled={!account || !player || Boolean(bookmarkSavingTag)}
            onClick={() => void toggleCurrentBookmark()}
            aria-label={
              !account
                ? "Sign in to bookmark this player"
                : currentBookmark
                  ? `Remove ${player?.name ?? "this player"} from bookmarks`
                  : `Bookmark ${player?.name ?? "this player"}`
            }
            title={
              !account
                ? "Sign in to bookmark players"
                : currentBookmark
                  ? "Remove bookmark"
                  : "Bookmark"
            }
          >
            {bookmarkSavingTag === player?.tag
              ? <RefreshCw className="animate-spin" size={19} />
              : <Bookmark size={19} />}
          </button>

          <div className="player-identity">
            <div className="level-shield" aria-label={player ? `King level ${player.expLevel}` : "Loading player level"}>
              <Crown size={24} />
              <strong>{player?.expLevel ?? "—"}</strong>
            </div>
            <div className="player-identity-copy">
              <div className="eyebrow-row">
                {data
                  ? <time className="player-synced-time" dateTime={data.syncedAt}>{formatSyncedTime(data.syncedAt)}</time>
                  : <span>Player lookup</span>}
                {player
                  ? (
                    <a
                      className="tag-pill"
                      href={getPlayerGameUrl(player.tag)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${player.name}'s profile in Clash Royale`}
                      title="Open in Clash Royale"
                    >
                      {player.tag}
                    </a>
                  )
                  : <span className="tag-pill">—</span>}
              </div>
              <div className="player-name-row">
                <ResponsivePlayerName name={player?.name ?? "Choose a player"} isGold={isGoldProfile} />
                {player && player.leagueNumber !== null && player.leagueNumber >= 7 && player.leagueMedals !== null && (
                  <span
                    className="ultimate-medals"
                    aria-label={`${formatNumber(player.leagueMedals)} Ultimate Champion medals${player.leagueRank !== null && player.leagueRank > 0 ? `, leaderboard rank ${formatNumber(player.leagueRank)}` : ""}`}
                    title="Ultimate Champion medals"
                  >
                    <Crown size={15} />
                    <strong>{formatNumber(player.leagueMedals)}</strong>
                    <small>medals</small>
                    {player.leagueRank !== null && player.leagueRank > 0 && (
                      <span className="leaderboard-rank" title={`Ranked leaderboard position ${formatNumber(player.leagueRank)}`}>
                        <strong>#{formatNumber(player.leagueRank)}</strong>
                        <small>rank</small>
                      </span>
                    )}
                  </span>
                )}
              </div>
              {playerArenaDetails ? (
                <p className="player-overview-details">
                  {playerClanDetails && <span className="player-clan-details">{playerClanDetails}</span>}
                  {playerClanDetails && <span className="player-overview-separator" aria-hidden="true"> · </span>}
                  <span className="player-arena-details">{playerArenaDetails}</span>
                </p>
              ) : (
                <p>{account ? "Set a default player or inspect any profile" : "Inspecting a player as a guest"}</p>
              )}
            </div>
          </div>

          <div className="profile-tools">
            <form className="player-search" onSubmit={loadPlayer}>
              <label htmlFor="player-tag">Player tag</label>
              <div className="search-control">
                <Input
                  id="player-tag"
                  value={playerTag}
                  onChange={(event) => setPlayerTag(event.target.value.toUpperCase())}
                  placeholder="#ABC123"
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button type="submit" disabled={isLoading}>
                  <RefreshCw className={isLoading ? "animate-spin" : ""} size={17} />
                  {isLoading ? "Loading" : "Sync"}
                </Button>
              </div>
              {message && <p className="form-message" role="alert">{message}</p>}
            </form>
          </div>

          {player ? (
            <>
          <div className="stat-grid">
            <article className="stat-card stat-primary">
              <span className="stat-icon trophy"><Trophy size={21} /></span>
              <div>
                <p>{hasSeasonalRoad ? "Total trophies" : "Trophies"}</p>
                <strong>{formatNumber(player.trophies)}</strong>
              </div>
              <small>
                {hasSeasonalRoad
                  ? `${formatNumber(player.maxTrophies)} Trophy Road`
                  : "14,000 Trophy Road"}
              </small>
            </article>
            <article className="stat-card stat-ranked">
              <span className="stat-icon crown"><Crown size={21} /></span>
              <div><p>Ranked league</p><strong>{player.leagueNumber ? `League ${player.leagueNumber}` : "Unranked"}</strong></div>
              <small>Path of Legends</small>
            </article>
            <article className="stat-card stat-wins">
              <span className="stat-icon swords"><Swords size={21} /></span>
              <div><p>Battle wins</p><strong>{formatNumber(player.wins)}</strong></div>
              <small>{formatNumber(player.battleCount)} battles</small>
            </article>
            <article className="stat-card stat-maxed">
              <span className="stat-icon cards"><Layers3 size={21} /></span>
              <div><p>Cards maxed</p><strong>{totals.maxed}</strong></div>
              <small>of {totals.total} cards</small>
            </article>
          </div>

          <div className="collection-progress">
            <div className="progress-heading">
              <div>
                <span>Collection progress</span>
                <strong>{totals.unlocked} / {totals.total}</strong>
              </div>
              <b>{completion}%</b>
            </div>
            <Progress value={completion} aria-label={`${completion}% of cards unlocked`} />
            <div className="progress-breakdown">
              <span><i className="dot unlocked" /> {totals.unlocked} unlocked</span>
              <span><i className="dot maxed" /> {totals.maxed} maxed</span>
              <span><i className="dot locked" /> {totals.locked} locked</span>
            </div>
            <div className="form-summary" aria-label="Special card forms">
              <span><Zap size={14} /> Evolutions <strong>{totals.evolutionsUnlocked}/{totals.evolutions}</strong></span>
              <span><Sparkles size={14} /> Heroes <strong>{totals.heroesUnlocked === null ? `—/${totals.heroes}` : `${totals.heroesUnlocked}/${totals.heroes}`}</strong></span>
            </div>
          </div>
          <div className="profile-action-row">
            <a href={`/battles?tag=${encodeURIComponent(player.tag)}`}>
              <Swords size={16} />
              Battles
            </a>
            <button type="button" onClick={() => setMoreStatsOpen(true)}>
              <BarChart3 size={16} />
              More Stats
            </button>
          </div>
            </>
          ) : (
            <div className={`profile-loading ${!isLoading ? "is-error" : ""}`} role="status">
              {isLoading ? <RefreshCw className="animate-spin" size={20} /> : account?.defaultPlayerTag ? <ShieldCheck size={20} /> : <UserRound size={20} />}
              <span>
                {isLoading
                  ? "Loading the live profile and collection…"
                  : message
                    ? "Live profile unavailable. Check the player tag and use Sync to try again."
                    : account?.defaultPlayerTag
                      ? "Use Sync to reload your default player."
                      : "Add a default player in Settings, or enter any player tag to inspect it."}
              </span>
            </div>
          )}
        </section>

        {canUseQueue && (
          <section className="upgrade-queue-section" id="upgrade-queue">
            <div className="section-heading queue-heading">
              <div>
                <span className="section-kicker">Your upgrade plan</span>
                <h2>Upgrade Queue</h2>
              </div>
              {queueSaveStatus !== "idle" && (
                <div className={`queue-sync-state is-${queueSaveStatus}`} role={queueSaveStatus === "error" ? "alert" : "status"}>
                  {queueSaveStatus === "saving" && <><RefreshCw className="animate-spin" size={13} /> Saving…</>}
                  {queueSaveStatus === "saved" && <><Check size={13} /> Synced across devices</>}
                  {queueSaveStatus === "error" && <><ShieldCheck size={13} /> {queueMessage}</>}
                </div>
              )}
            </div>

            {!queueLoaded ? (
              <div className="queue-loading" role="status">
                <RefreshCw className="animate-spin" size={18} /> Loading your upgrade plan…
              </div>
            ) : queueSaveStatus === "error" && queueItems.length === 0 ? (
              <div className="queue-loading is-error">
                <ShieldCheck size={18} /> {queueMessage}
              </div>
            ) : (
              <div className="queue-lanes">
                {queueRarities.map((rarity) => {
                  const laneItems = queueItems
                    .filter((item) => item.rarity === rarity)
                    .sort((left, right) => left.position - right.position);
                  return (
                    <section className={`queue-lane ${rarityClass[rarity]}`} key={rarity} aria-labelledby={`queue-${rarity}`}>
                      <div className="queue-lane-heading">
                        <div>
                          <span className="queue-rarity-dot" />
                          <h3 id={`queue-${rarity}`}>
                            <button
                              className="queue-rarity-filter"
                              type="button"
                              onClick={() => showCollectionFilter(rarity)}
                              aria-label={`Show ${rarity} cards in the collection`}
                            >
                              {rarity}
                            </button>
                          </h3>
                        </div>
                      </div>

                      <div
                        className={`queue-card-rail ${draggedCardRarity === rarity ? "is-dragging" : ""}`}
                        aria-label={`${rarity} upgrade order`}
                        data-queue-rail={rarity}
                      >
                        <div className="queue-card-list">
                          {laneItems.map((item, index) => {
                          const card = collection.find((candidate) => candidate.id === item.cardId);
                          if (!card) return null;
                          const displayIconUrl = (card.heroUnlocked ? card.heroIconUrl : null) ??
                            (card.evolutionUnlocked ? card.evolutionIconUrl : null) ??
                            card.iconUrl;
                          const fallbackIconUrl = displayIconUrl !== card.iconUrl ? card.iconUrl : null;
                          const upgradeProgress = card.copiesNeeded
                            ? Math.min(100, (card.count / card.copiesNeeded) * 100)
                            : 0;
                          return (
                            <article
                              className={`queue-card ${draggedCardId === card.id ? "is-dragging" : ""}`}
                              id={`queue-card-${card.id}`}
                              key={card.id}
                              data-queue-card-id={card.id}
                              data-queue-rarity={rarity}
                            >
                              <div className="queue-card-topline">
                                <span className="queue-priority">#{index + 1}</span>
                                <button
                                  className="queue-drag-handle"
                                  type="button"
                                  aria-label={`Drag ${card.name} to change its priority`}
                                  title="Drag to reorder"
                                  onPointerDown={(event) => beginQueueDrag(event, card.id, rarity)}
                                >
                                  <GripVertical size={15} />
                                </button>
                                <button
                                  className="queue-remove"
                                  type="button"
                                  onClick={() => removeCardFromQueue(card.id)}
                                  aria-label={`Remove ${card.name} from the queue`}
                                  title="Remove from queue"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                              <div className="queue-card-body">
                                <div className="queue-card-art">
                                  {displayIconUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={displayIconUrl}
                                      alt=""
                                      onError={fallbackIconUrl
                                        ? (event) => replaceBrokenCardArt(event, fallbackIconUrl)
                                        : undefined}
                                    />
                                  ) : (
                                    <span>{initials(card.name)}</span>
                                  )}
                                </div>
                                <div className="queue-card-copy">
                                  <span>{card.rarity}</span>
                                  <h4>{card.name}</h4>
                                  <strong>Level {card.level}</strong>
                                </div>
                              </div>
                              <div className="queue-progress" aria-label={`${Math.round(upgradeProgress)}% of cards collected for the next level`}>
                                <span style={{ width: `${upgradeProgress}%` }} />
                              </div>
                              <small>{formatNumber(card.count)} / {formatNumber(card.copiesNeeded ?? 0)} cards</small>
                              <div className="queue-order-controls">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    moveQueueCard(rarity, card.id, -1);
                                  }}
                                  disabled={index === 0}
                                  aria-label={`Move ${card.name} left`}
                                >
                                  <ChevronLeft size={15} />
                                </button>
                                <span>Priority</span>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    moveQueueCard(rarity, card.id, 1);
                                  }}
                                  disabled={index === laneItems.length - 1}
                                  aria-label={`Move ${card.name} right`}
                                >
                                  <ChevronRight size={15} />
                                </button>
                              </div>
                            </article>
                          );
                          })}
                          {laneItems.length === 0 && (
                            <button
                              className="queue-empty-lane"
                              type="button"
                              onClick={() => showCollectionFilter(rarity)}
                            >
                              <Plus size={18} />
                              <span>Select a {rarity.toLowerCase()} card from your collection</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {data && <section className="collection-section" id="collection">
          <div className="section-heading">
            <div>
              <span className="section-kicker">{isDefaultProfile ? "Your collection" : "Card collection"}</span>
              <h2>Every card. One clear view.</h2>
            </div>
            <p>{formatSyncedTime(data.syncedAt)}</p>
          </div>

          <div className="collection-toolbar">
            <div className="rarity-tabs" role="group" aria-label="Filter cards by rarity">
              {collectionFilters.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={filter === item ? "selected" : ""}
                  onClick={() => setFilter(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <label className="card-search">
              <Search size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a card"
                aria-label="Find a card"
              />
            </label>
            <Select value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}>
              <SelectTrigger className="sort-select" aria-label="Sort cards by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="level">Level</SelectItem>
                <SelectItem value="elixir">Elixir</SelectItem>
                <SelectItem value="rarity">Rarity</SelectItem>
              </SelectContent>
            </Select>
            <button
              className="sort-direction"
              type="button"
              onClick={() => setSortDirection((current) => current === "asc" ? "desc" : "asc")}
              aria-label={`Sort ${sortDirection === "asc" ? "ascending" : "descending"}. Click to reverse.`}
              title={`Sorted ${sortDirection === "asc" ? "ascending" : "descending"}`}
            >
              {sortDirection === "asc" ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
              <span>{sortDirection === "asc" ? "Ascending" : "Descending"}</span>
            </button>
          </div>

          <div className="card-grid">
            {visibleCards.map((card) => {
              const isMaxed = card.unlocked && card.level !== null && card.level >= card.maxLevel;
              const isQueued = queuedCardIds.has(card.id);
              const queueLaneCount = queueItems.filter((item) => item.rarity === card.rarity).length;
              const isQueueFull = queueLaneCount >= queueLimits[card.rarity];
              const queueOverlayOpen = canUseQueue && activeCardId === card.id;
              const upgradeProgress = card.copiesNeeded
                ? Math.min(100, (card.count / card.copiesNeeded) * 100)
                : 0;
              const displayIconUrl = filter === "Evolutions"
                ? card.evolutionIconUrl ?? card.iconUrl
                : filter === "Heroes"
                  ? card.heroIconUrl ?? card.iconUrl
                  : (card.heroUnlocked ? card.heroIconUrl : null) ??
                    (card.evolutionUnlocked ? card.evolutionIconUrl : null) ??
                    card.iconUrl;
              const fallbackIconUrl = displayIconUrl !== card.iconUrl ? card.iconUrl : null;
              const showLockedFormArtwork = Boolean(
                (filter === "Evolutions" && !card.evolutionUnlocked && card.evolutionIconUrl) ||
                (filter === "Heroes" && !card.heroUnlocked && card.heroIconUrl),
              );
              const evolutionBadge = card.hasEvolution ? (
                <span className={`form-badge evo-badge ${card.evolutionUnlocked ? "is-unlocked" : ""}`} title={`Evolution ${card.evolutionUnlocked ? "unlocked" : "locked"}`}>
                  <Zap size={11} /> Evo <i />
                </span>
              ) : null;
              const heroBadge = card.hasHero ? (
                <span className={`form-badge hero-badge ${card.heroUnlocked ? "is-unlocked" : ""}`} title={`Hero ${card.heroUnlocked ? "unlocked" : "locked"}`}>
                  <Sparkles size={11} /> Hero <i />
                </span>
              ) : null;
              return (
                <article
                  className={`collection-card ${rarityClass[card.rarity]} ${card.isTowerTroop ? "is-tower-troop" : ""} ${!card.unlocked ? "is-locked" : ""} ${canUseQueue ? "is-actionable" : ""} ${queueOverlayOpen ? "is-queue-open" : ""}`}
                  key={card.id}
                >
                  <div className={`card-art ${showLockedFormArtwork ? "is-form-locked" : ""}`}>
                    {!card.isTowerTroop && (
                      <span className="elixir-badge">{card.elixirCost ?? "?"}</span>
                    )}
                    {displayIconUrl ? (
                      // The official API supplies these card images.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={displayIconUrl}
                        alt=""
                        onError={fallbackIconUrl
                          ? (event) => replaceBrokenCardArt(event, fallbackIconUrl)
                          : undefined}
                      />
                    ) : (
                      <span className="card-monogram">{initials(card.name)}</span>
                    )}
                    {!card.unlocked && <span className="locked-overlay"><LockKeyhole size={24} /></span>}
                  </div>
                  <div className="card-info">
                    <div className="card-meta-row">
                      <span className="rarity-label">{card.rarity}</span>
                      {card.hasHero ? heroBadge : evolutionBadge}
                    </div>
                    {card.hasHero && card.hasEvolution ? (
                      <DualFormCardName
                        name={card.name}
                        evolutionUnlocked={card.evolutionUnlocked}
                      />
                    ) : (
                      <div className="card-name-row"><h3>{card.name}</h3></div>
                    )}
                    <div className="card-level-row">
                      <strong>{card.unlocked ? `Level ${card.level}` : "Locked"}</strong>
                      {isMaxed && <span className="maxed-pill">Maxed</span>}
                    </div>
                    {card.unlocked && !isMaxed && (
                      <div className="card-count">
                        <span className={card.count > 0 ? "has-cards" : ""} style={{ width: `${upgradeProgress}%` }} />
                        <small>{formatNumber(card.count)} / {formatNumber(card.copiesNeeded ?? 0)} cards</small>
                      </div>
                    )}
                    {isMaxed && <p className="maxed-copy"><ShieldCheck size={14} /> Fully upgraded</p>}
                  </div>
                  {canUseQueue && !queueOverlayOpen && (
                    <button
                      className="queue-card-trigger"
                      type="button"
                      aria-label={`${card.name}. Open queue actions.`}
                      onClick={() => setActiveCardId(card.id)}
                    />
                  )}
                  {queueOverlayOpen && (
                    <div className="queue-card-overlay">
                      <button
                        className="queue-overlay-close"
                        type="button"
                        aria-label="Close queue actions"
                        onClick={() => setActiveCardId(null)}
                      >
                        <X size={15} />
                      </button>
                      <ListOrdered size={22} />
                      <strong>{card.name}</strong>
                      <button
                        className={`queue-overlay-action ${isQueued ? "is-added" : ""}`}
                        type="button"
                        disabled={!queueLoaded || !card.unlocked || isMaxed || (!isQueued && isQueueFull)}
                        onClick={() => {
                          if (isQueued) {
                            showQueuedCard(card);
                            return;
                          }
                          addCardToQueue(card);
                        }}
                      >
                        {isQueued ? <Check size={15} /> : isMaxed || !card.unlocked ? <LockKeyhole size={15} /> : <Plus size={15} />}
                        {!queueLoaded
                          ? "Loading Queue"
                          : isQueued
                            ? "Added to Queue"
                            : isMaxed
                              ? "Already Maxed"
                              : !card.unlocked
                                ? "Card Locked"
                                : isQueueFull
                                  ? `${card.rarity} Queue Full`
                                  : "Add to Queue"}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {visibleCards.length === 0 && (
            <div className="empty-state">
              <Search size={22} />
              <p>No cards match those filters.</p>
            </div>
          )}
        </section>}
      </section>

      <footer>
        <span>Royale Lens</span>
        <p>Not affiliated with Supercell. Game data is supplied by the official Clash Royale API.</p>
      </footer>
      {accountDialogs}
    </main>
  );
}
