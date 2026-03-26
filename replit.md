# Virtual General Contractor (VGC)

## Overview

AI-powered web application where real estate agents paste a Zillow URL and receive instant, localized, itemized renovation quotes via conversational chat with an AI "Virtual GC" agent. Includes shareable quote links, subscription tiers, demo page with lead capture, and a built-in cost engine with regional labor multipliers.

pnpm workspace monorepo using TypeScript.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **AI**: OpenAI GPT-4o (primary), Anthropic Claude (quote validator)
- **Auth**: Session-based (express-session + connect-pg-simple + bcrypt)

## API Keys (Replit Secrets)

- `OpenAI_API_Key` — GPT-4o for chat and quote generation
- `Claude_API_Key` — Claude for second-opinion quote validation
- `Apify_API` — Zillow property data scraping
- `SESSION_SECRET` — Express session encryption
- `DATABASE_URL` — auto-provided by Replit

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
│           │   └── auth.ts          # requireAuth, requireTier, requireOrgAdmin
│           └── routes/
│               ├── index.ts         # Mount all sub-routers
│               ├── health.ts        # GET /api/healthz
│               ├── auth.ts          # POST /api/auth/{register,login,logout}, GET /api/auth/session
│               ├── properties.ts    # POST /api/properties/{lookup,manual}
│               ├── conversations.ts # POST /api/conversations, messages, GET conversation
│               ├── quotes.ts        # CRUD /api/quotes, sharing, generate
│               ├── demo.ts          # POST /api/demo/{estimate,lead}
│               └── costEngineRoutes.ts  # GET /api/cost-engine/{materials,labor-rates,regional-multiplier}
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
│       └── src/schema/
│           ├── organizations.ts   # organizations table
│           ├── users.ts           # users table (auth, roles, tiers)
│           ├── properties.ts      # properties table (Zillow data)
│           ├── conversations.ts   # conversations table (JSONB messages)
│           ├── quotes.ts          # quotes + quote_line_items tables
│           ├── costEngine.ts      # material_costs, labor_rates, regional_multipliers, bls_cache
│           └── leadCaptures.ts    # lead_captures table
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
- **Cost engine seed**: Runs automatically on server start via `seedCostEngine()` — 49 materials, 12 labor rates, 50 regional multipliers for top US metros

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

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from OpenAPI spec.

### `scripts` (`@workspace/scripts`)

Utility scripts. Run via `pnpm --filter @workspace/scripts run <script>`.
