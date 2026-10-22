<div align="center">
  <img src="./public/icon-192.png" alt="Royale Lens crown" width="96" height="96" />
  <h1>Royale Lens</h1>
  <p><strong>A polished Clash Royale profile, collection, battle history, and upgrade-planning dashboard.</strong></p>
  <p>
    <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-111827?style=flat-square&logo=next.js" />
    <img alt="React 19" src="https://img.shields.io/badge/React-19-0f172a?style=flat-square&logo=react" />
    <img alt="Cloudflare Workers" src="https://img.shields.io/badge/Cloudflare-Workers-f59e0b?style=flat-square&logo=cloudflare&logoColor=white" />
    <img alt="Cloudflare D1" src="https://img.shields.io/badge/Storage-D1-fbbf24?style=flat-square&logo=cloudflare&logoColor=111827" />
  </p>
</div>

---

## Overview

Royale Lens turns live Clash Royale account data into a responsive dashboard for desktop, mobile, landscape, and foldable displays. It combines profile insights, collection tracking, battle history, bookmarks, and a synchronized personal Upgrade Queue.

## Highlights

- Live player overview with trophies, ranked progress, wins, arenas, and collection completion
- Searchable and sortable collection with Evolution, Hero, rarity, and Tower Troop views
- Detailed battle history with mode-aware filtering, decks, levels, tower troops, and copy-deck links
- Personal Upgrade Queue with drag, touch, and arrow-button reordering
- Bookmarked players with synchronized custom ordering
- Google sign-in and account-specific Cloudflare D1 storage
- Guest player lookup with server-side rate limiting
- Installable PWA with responsive artwork and dark launch experience

## Architecture

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Interface | Next.js 16, React 19, Tailwind CSS | Responsive pages, cards, overlays, menus, and PWA UI |
| Runtime | Vinext on Cloudflare Workers | Server rendering and API route execution |
| Persistence | Cloudflare D1, Drizzle schema | Accounts, sessions, queues, bookmarks, limits, and observed stats |
| Authentication | Google Identity Services | Account sign-in and secure server-side identity verification |
| Game data | Clash Royale API | Player profiles, collections, battles, cards, and events |

## Project structure

```text
app/             Pages, interface components, and server API routes
components/ui/   Reusable interface primitives
db/              D1 connection and database schema
drizzle/         Ordered D1 migrations
lib/             Authentication, classification, ordering, and utility logic
public/          PWA icons and brand assets
vendor/          Vendored styles and their license notice
```

## Local development

### Requirements

- Node.js 22.13 or newer
- pnpm 11.25
- A Cloudflare account
- Google OAuth web client ID
- Clash Royale API token

### Setup

```bash
pnpm install
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm dev
```

Add the development values to `.dev.vars` before starting the application. That file is ignored by Git.

### Quality checks

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## Cloudflare deployment

1. Create a D1 database named `royale-lens-db`.
2. Replace the placeholder `database_id` in `wrangler.jsonc` with the generated D1 ID.
3. Apply the migrations with `pnpm db:migrate:remote`.
4. Add `CLASH_ROYALE_API_TOKEN` and `GOOGLE_CLIENT_ID` as Worker secrets or encrypted build variables.
5. Build and deploy with `pnpm deploy`, or connect the repository to Cloudflare Workers Builds.

The API token and populated local variable files must never be committed.

## Release

The initial independent deployment is tracked as **Version 1** (`v1.0.0`). Future work should use feature branches and Cloudflare preview deployments before merging into `main`.

## Disclaimer

Royale Lens is an independent project and is not affiliated with, endorsed by, or sponsored by Supercell. Clash Royale and related assets are trademarks of Supercell Oy. Game data is supplied through the Clash Royale API.
