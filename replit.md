# Workspace

## Overview

pnpm workspace monorepo using TypeScript. VelaGo landing web app MVP — a mobile-first interactive landing page for voice-powered booking assistant.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## VelaGo Landing Page

- **Location**: `artifacts/velago-landing/`
- **Type**: Presentation-first React + Vite web app (no backend needed)
- **Font**: Outfit (Google Fonts)
- **Brand colors**: Background #F4F7FF, Primary gradient #1340C4 to #3B8EF0, Accent #CCFBF1, Dark text #0C1426
- **Features**:
  - Voice input via Web Speech API with graceful fallback
  - Text input with keyword-based intent detection
  - Simulated demo responses for 3 categories: food delivery, flights, parcel delivery
  - Auto-rotating "Try saying" carousel
  - Service cards, how-it-works steps, rebooking USP block, final CTA
- **Logo**: VelaGo gold logo imported from `@assets/velago_gold_logo_1775724891506.png`

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
