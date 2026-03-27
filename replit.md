# Virtual General Contractor (VGC)

## Overview

AI-powered web application where real estate agents paste a Zillow URL and receive instant, localized, itemized renovation quotes via conversational chat with an AI "Virtual GC" agent. Includes shareable quote links, subscription tiers, demo page with lead capture, and a built-in cost engine with regional labor multipliers.

pnpm workspace monorepo using TypeScript.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React 19 + Vite + Tailwind CSS v4 + Shadcn UI
- **Routing**: wouter
- **State**: TanStack React Query + generated hooks from Orval
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (v3 API for forms via custom `zodFormResolver`, `zod/v4` for backend), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle for API), Vite (frontend)
- **AI**: OpenAI GPT-4o (primary chat + visual description extraction), OpenAI GPT Image 1 (renovation photo editing via `gpt-image-1`), Anthropic Claude (quote validator), Google Gemini (chat via `gemini-2.5-flash`)
- **Auth**: Session-based (express-session + connect-pg-simple + bcrypt)

## API Keys (Replit Secrets)

- `OpenAI_API_Key` — GPT-4o for chat and quote generation
- `Claude_API_Key` — Claude for second-opinion quote validation
- `Apify_API` — Zillow property data scraping (primary provider)
- `RentCast_API_Key` — RentCast property data API (fallback provider)
- `SESSION_SECRET` — Express session encryption
- `AI_INTEGRATIONS_GEMINI_BASE_URL` — Gemini AI proxy URL (auto-provisioned by Replit AI Integrations)
- `AI_INTEGRATIONS_GEMINI_API_KEY` — Gemini AI proxy key (auto-provisioned by Replit AI Integrations)
- `DATABASE_URL` — auto-provided by Replit

## Property Lookup Provider Chain

The property lookup system (`zillowService.ts`) uses a waterfall strategy:
1. **Apify** (primary, ~15-30s) — Runs `maxcopell/zillow-detail-scraper` actor with `waitForFinish=60`. Parses nested `address` object and `originalPhotos`/`responsivePhotos` arrays for listing images.
2. **RentCast** (fallback, ~1s) — Parses address from Zillow URL slug, queries RentCast REST API
3. **Sample fallback** — If all providers fail, uses a hardcoded set of 5 sample properties so the demo never breaks

The demo route (`/api/demo/estimate`) returns `usedFallback: true` and a provider-specific `fallbackNotice` message when sample data is used.

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server (VGC backend)
│       └── src/
│           ├── index.ts         # Entry: PORT, seed, listen
│           ├── app.ts           # Express setup: CORS, sessions, routes
│           ├── seed.ts          # Cost engine seed data (materials, labor, multipliers)
│           ├── lib/
│           │   ├── aiPipeline.ts     # OpenAI chat + Claude review
│           │   ├── costEngine.ts     # BLS QCEW integration, material/labor lookups
│           │   ├── zillowService.ts  # Apify Zillow scraper with fallback chain
│           │   └── logger.ts        # Pino logger
│           ├── middlewares/
│           │   └── auth.ts          # requireAuth, requireTier, requireOrgAdmin, requireSuperAdmin
│           ├── scripts/
│           │   └── seed-admin.ts    # Seed/promote super_admin account
│           └── routes/
│               ├── index.ts         # Mount all sub-routers
│               ├── health.ts        # GET /api/healthz
│               ├── auth.ts          # POST /api/auth/{register,login,logout}, GET /api/auth/session
│               ├── properties.ts    # POST /api/properties/{lookup,manual}
│               ├── conversations.ts # POST /api/conversations, messages, GET conversation
│               ├── quotes.ts        # CRUD /api/quotes, sharing, generate
│               ├── demo.ts          # POST /api/demo/{estimate,lead}
│               ├── costEngineRoutes.ts  # GET /api/cost-engine/{materials,labor-rates,regional-multiplier}
│               └── admin.ts         # GET/PATCH /api/admin/{stats,users,organizations} (super_admin only)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   ├── integrations-gemini-ai/  # Gemini AI integration (chat)
│   └── db/                 # Drizzle ORM schema + DB connection
│       └── src/schema/
│           ├── organizations.ts   # organizations table
│           ├── users.ts           # users table (auth, roles, tiers)
│           ├── properties.ts      # properties table (Zillow data)
│           ├── conversations.ts   # conversations table (JSONB messages)
│           ├── quotes.ts          # quotes + quote_line_items tables
│           ├── costEngine.ts      # material_costs, labor_rates, regional_multipliers, bls_cache
│           └── leadCaptures.ts    # lead_captures table
│   └── vgc-app/            # React frontend (Vite + Tailwind)
│       └── src/
│           ├── App.tsx           # Root router
│           ├── index.css         # Tailwind + theme variables
│           ├── hooks/
│           │   └── use-auth.tsx  # Auth hook (session check + redirect)
│           ├── components/
│           │   ├── layout.tsx    # AppLayout with nav
│           │   └── ui/          # Shadcn UI components
│           └── pages/
│               ├── landing.tsx       # Public landing page
│               ├── auth.tsx          # Login + Register tabs
│               ├── dashboard.tsx     # Zillow URL input (protected)
│               ├── chat.tsx          # AI conversation (protected)
│               ├── quote-view.tsx    # Itemized quote display (protected)
│               ├── history.tsx       # Quote history list (protected)
│               ├── shared-quote.tsx  # Public shareable quote (/quote/:uuid)
│               ├── demo.tsx          # Public demo page
│               └── not-found.tsx     # 404
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — `pnpm run typecheck` (runs `tsc --build --emitDeclarationOnly`)
- **`emitDeclarationOnly`** — only `.d.ts` files during typecheck; JS bundling by esbuild
- **Project references** — when package A depends on B, A's `tsconfig.json` must list B in `references`

## Root Scripts

- `pnpm run build` — typecheck then recursively build all packages
- `pnpm run typecheck` — `tsc --build --emitDeclarationOnly`

## Key Development Notes

- **Express 5 rules**: async handlers typed `Promise<void>`, use `res.status().json(); return;` not `return res.status().json()`, wildcard routes use `/*splat`
- **Logging**: Use `req.log` in route handlers, `logger` singleton for non-request code; never `console.log`
- **Database push**: `pnpm --filter @workspace/db run push` (development), force with `push-force`
- **Codegen**: `pnpm --filter @workspace/api-spec run codegen` (regenerates React hooks + Zod schemas)
- **Cost engine seed**: Runs automatically on server start via `seedCostEngine()` — 85 base materials (17 categories), 12 labor rates, 50 regional multipliers for top US metros. Uses item-level backfill: new materials are inserted if missing by category+item key.
- **Smart Scope configurator**: When user sends a message with renovation intent, the AI response includes `configuratorType` field. Frontend renders interactive chip-based material selection UI. Selections produce deterministic "Locked" quotes via `POST /conversations/:id/configurator-quote`. Existing AI flow produces "Estimated" quotes. Config map in `artifacts/api-server/src/lib/configuratorMap.ts`. Supports 13 renovation types: kitchen, bathroom, flooring, painting, windows, staircase, roof, hvac, deck, garage, basement, exteriorPaint, landscaping.

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server with session auth, AI pipeline, cost engine, Zillow integration.

- Entry: `src/index.ts`
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev`

### `lib/db` (`@workspace/db`)

Drizzle ORM with PostgreSQL. 9 tables: organizations, users, properties, conversations, quotes, quote_line_items, material_costs, labor_rates, regional_multipliers, bls_cache, lead_captures.

- Exports: `.` (pool, db, schema), `./schema` (schema only)

### `lib/api-spec` (`@workspace/api-spec`)

OpenAPI 3.1 spec with Orval codegen. Run: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from OpenAPI spec. Used by api-server for request validation.

### `artifacts/vgc-app` (`@workspace/vgc-app`)

React + Vite frontend. Port 24922. Dark theme. Pages: landing, auth, dashboard, chat, quote-view, shared-quote, demo, history.

- Public routes: `/`, `/demo`, `/quote/:uuid`, `/login`, `/register`
- Protected routes: `/dashboard`, `/chat/:id`, `/quotes`, `/quotes/:id`
- Uses generated React Query hooks from `@workspace/api-client-react`
- Auth via `useAuth()` hook checking `GET /api/auth/session`

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from OpenAPI spec.

### `scripts` (`@workspace/scripts`)

Utility scripts. Run via `pnpm --filter @workspace/scripts run <script>`.
