# CLAUDE.md — rules for working on this repository

Multi-tenant POS SaaS for mobile phone shops (first tenant: Mobile Relation, Singapore — SGD, GST 9% inclusive).
Read `docs/01-architecture.md` and `docs/03-inventory-states.md` before changing business logic.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript strict · Tailwind CSS 4 · PostgreSQL · Prisma 7 · Zod 4.

## Commands

- `npm run dev` — dev server (needs `docker compose up -d db` and `.env`)
- `npm run typecheck` and `npm test` — run both before every commit
- `npm run setup` — first-time DB setup + demo tenant (shop code `demo`, owner@example.com / demo1234)
- `npm run prisma:generate` — after any schema change
- `npm run tenants:sync` / `npm run db:push:control` — apply schema changes (v1 uses `prisma db push`)
- `npm run inventory:check -- --tenant demo` — verify inventory invariants after touching stock code

## Architecture rules (modular monolith)

1. Business logic lives in `src/modules/<module>/`. Each module exposes its API through `index.ts`.
   Other modules and server code import **only** `@/modules/<module>` (never internal files).
2. **Client components** (`"use client"`) import only `@/modules/<module>/client` (pure helpers + types).
   Never import a module's `index.ts` from client code — it pulls in Prisma.
3. Table ownership: only the owning module writes its tables (see `docs/01-architecture.md` §2.2).
   **Only `inventory` writes** `StockLevel`, `StockUnit`, `StockUnitEvent`, `InventoryMovement`, `StockAdjustment`.
   Other modules call `receiveStock` / `issueStock` / `returnStock` / `receiveTransferredStock` **inside their own
   `$transaction`**, passing `tx`, so the document and the stock change commit together.
4. Never `update` a `StockUnit.status` directly — all transitions go through `transitionUnit` (state machine in
   `src/modules/inventory/unit-state.ts`, with compare-and-set). Keep the invariants in `docs/03-inventory-states.md` §3.
5. Services receive a `ServiceContext` (`db`, `userId`, `role`, `outletId`, `limits`), validate input with Zod
   (`parseInput`) and check permissions with `assertCan(ctx, "<permission>")`. Permissions live in
   `src/lib/auth/permissions.ts`.
6. API routes (`src/app/api/**/route.ts`) are thin: `tenantRoute(async ({ req, ctx, params }) => service(ctx, await readJson(req)))`.
   Throw `AppError` subclasses from `src/lib/errors.ts`; the wrapper maps them to HTTP status codes.
7. Every page calls `requireTenantContext()` (or `requirePlatformAdmin()`) itself — layouts are not enough because
   they do not re-run on client navigation. Hide UI with `can(role, permission)`, but enforcement is in services.
8. `reports` is read-only and may query across tables.

## Multi-tenancy

- Control DB (`getControlDb()`, `@/generated/control/client`) is used only by `src/modules/tenant` and `src/lib/auth`.
- Tenant data is always accessed through `ctx.db` (the tenant's own database). There is no `tenantId` column —
  isolation is per database. Never cache tenant data across requests without keying by tenant.
- New tenant = `provisionTenant()` (creates DB, `prisma db push`, seeds HQ outlet, owner, payment methods).

## Conventions

- Money is **integer cents** in fields ending in `Cents`. Format with `formatMoney(cents, currency)`; parse user input
  with `parseMoneyToCents`. Never use floats for money.
- Tax: `BusinessProfile.taxRateBps` (900 = 9%) + `taxInclusive`. Pricing logic is shared by POS and server:
  `src/modules/sales/pricing.ts` (unit tested). Sale lines store snapshots (description, SKU, IMEI, price, cost).
- Dates: business timezone from `TZ` (default Asia/Singapore). Use helpers in `src/lib/time.ts`
  (`startOfDay`, `parseDateInput`, `toDateInputValue`, `formatDateTime`).
- Document numbers via `nextDocumentNumber` / `nextSaleNumber` (`src/lib/doc-number.ts`) inside the transaction.
- Prisma 7: import the client and types from `@/generated/tenant/client`, enums from `@/generated/tenant/enums`.
  Clients use the `@prisma/adapter-pg` driver adapter. Generated code is in `src/generated/` (git-ignored).
- Next.js 16: `params` and `searchParams` are Promises (`await` them); type page `searchParams` as `SearchParams`
  from `src/lib/page.ts`. No middleware/proxy is used.
- Tailwind v4: always give borders an explicit colour (`border border-slate-200`); buttons get `cursor: pointer`
  from `globals.css`. Reuse components in `src/components/ui`.
- UI text is English (Singapore retail staff); docs are Chinese.

## When changing the schema

Edit `prisma/tenant/schema.prisma` (business) or `prisma/control/schema.prisma` (SaaS), run `npm run prisma:generate`,
then `npm run tenants:sync` / `npm run db:push:control`. Update `docs/02-database-erd.md` when tables change.
Before production, switch to `prisma migrate` (see `docs/05-roadmap.md`).
