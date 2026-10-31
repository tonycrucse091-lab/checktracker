# CheckTrack — Implementation Plan

**Status:** Approved by the user on 2026-10-21; source implementation is complete. Supabase/Vercel provisioning and live service verification remain pending. This plan does not authorize deployment or repository changes.

## Product and scope

Build the requested CheckTrack administrative system, not a visual prototype. It manages administrative check records and manually or externally sourced status information. It will not create negotiable check documents, store bank account/routing data or actual check images, imitate official bank-issued cashier’s checks, or represent a manually entered status as proof of funds.

The MVP is scoped to one organization. Administrators provision and manage authorized users. Access is enforced with Supabase Auth, PostgreSQL grants and Row Level Security (RLS), and trusted Supabase Edge Functions for privileged operations. The roles are Administrator, Staff, and Read-only. Administrators manage users and records, Staff can create and edit permitted business fields and make permitted status updates, and Read-only users may only view authorized records and histories. Administrators can export; Staff export requires an explicit profile permission; Read-only cannot export. Staff and Read-only may see all active records in the single configured organization. There are no record-level assignments or multi-organization tenancy in this MVP.

## Technical approach

- **Frontend and hosting:** React, Vite, TypeScript, Tailwind CSS, accessible Radix primitives, and a responsive single-page application. The project prepares a static frontend for Vercel, with a same-app rewrite for direct access to nested routes.
- **Authentication and database:** Supabase Auth, PostgreSQL, SQL migrations, database functions and RLS. The browser receives only the Supabase project URL and publishable key. A publishable key is public, not an authorization mechanism; database grants and RLS enforce access. Open public signup is disabled. Authenticated accounts are invited by administrators.
- **Administrator MFA:** Administrators must complete Supabase AAL2 using a TOTP authenticator before administrator-only actions are available. The UI provides enrollment and challenge steps. Database role helpers and trusted Edge Functions also enforce AAL2; client-side navigation alone is not the control. Staff and Read-only users do not require administrator MFA.
- **Trusted operations:** Supabase Edge Functions verify the caller’s JWT, active profile, role, and AAL2 where relevant before managing Auth users, changing roles/accounts, or exporting. The Supabase secret/service key is server-side only. Narrowly scoped SQL functions enforce permitted status transitions, archival, actor attribution, and profile changes. Audit/status changes are written by database triggers/functions; ordinary users cannot rewrite or delete audit rows.
- **Data model:** versioned migrations define `profiles`, `check_records`, `check_status_history`, and `audit_logs`, with foreign keys, a unique non-sensitive tracking reference, amount/currency/date/status constraints, timestamps and indexes. The history stores `check_record_id`, previous/new status, authenticated actor, timestamp, optional reason and available verification-source/time details. Profile data includes an explicit Staff export permission. Development samples, if supplied, are fictional and are never applied automatically to a live database.
- **Reporting:** Dashboard totals, recent activity, record search and filters, sorting, pagination, and CSV export query the database and respect RLS and active filters. Exports are permission-checked on the Edge Function, actor-logged, formula-injection-safe, and omit secrets and unnecessary sensitive fields. Without a configured Supabase project, the application clearly reports its setup state rather than inventing records or totals.
- **Tests and documentation:** Vitest covers domain/UI workflows and CSV safety; pgTAP tests RLS, grants, role permissions, status transitions, audit integrity and archive restrictions. Service-dependent tests are clearly identified and require a disposable local Supabase stack; the managed production database is never used as a test target. README documentation covers local setup, Supabase project/bootstrap, migrations, tests, production build, GitHub/Vercel guide, backups, recovery, and security verification.
- **Delivery boundary:** The supplied work includes complete source and setup/deployment instructions, not a live Supabase project, Vercel deployment, creation/switching of a GitHub repository, or invented credentials. No live functionality or production readiness will be claimed until the external project is configured and verified.

## Approved status workflow

Status changes occur through a server/database-validated RPC and append immutable history plus minimized audit events. Each status event retains actor, timestamp, prior/new value, optional reason and verification details where a trusted source exists.

| Current status | Allowed next status(es) |
| --- | --- |
| Draft | Issued, Cancelled |
| Issued | Pending, On Hold, Cancelled |
| Pending | Processing, On Hold, Cancelled |
| Processing | Cleared, Returned, On Hold |
| On Hold | Pending, Processing, Cancelled |
| Cleared | Terminal |
| Returned | Terminal |
| Cancelled | Terminal |

A transition to Cleared or Returned remains manually recorded unless an authorized verification source and timestamp are separately provided by a trusted integration. It is not independent proof of payment.

## Design direction

**Design movement:** Contemporary Swiss editorial design for a trustworthy administrative workspace; the user’s supplied restrained executive-finance direction takes precedence over decorative trends.

**Core principles:** Auditability before ornament; clear status before dense metadata; role-aware simplicity; calm, accessible contrast.

**Color philosophy:** Midnight navy `#172638` signals stewardship and structure; warm ivory `#F5F1E8` reduces glare in long administrative sessions; charcoal `#34383D` keeps body copy grounded; white surfaces separate records; muted gold `#C0A36B` marks controlled attention and is never used as a sole status cue.

**Layout paradigm:** A compact, persistent desktop navigation rail anchors an expansive work surface. KPI cards form a short top-of-page scanline; the records table occupies the primary content area, with a narrower activity timeline alongside the dashboard. Mobile collapses the rail into an accessible drawer and keeps filters and actions reachable without reducing table legibility.

**Signature elements:** A small original CheckTrack ledger/check-mark SVG; restrained gold edge accents on summary cards; compact status pills with both text and a color-independent dot.

**Interaction philosophy:** Show only actions authorized for the signed-in role, while enforcing each action again server-side. Confirm archive and other sensitive changes. Use inline validation, explicit success/failure feedback, persistent status history, and no surprise data mutations.

**Animation:** Use short 120–200 ms fades and small state transitions for menus/dialogs; never animate financial amounts or status changes as if funds moved. Loading skeletons are subtle; all motion is reduced or removed when `prefers-reduced-motion` is active.

**Typography system:** Inter with robust system-sans fallbacks for interface labels and headings; a system monospace stack for opaque IDs and references; tabular numerals for amounts and totals. Headings use a close, crisp hierarchy, with no decorative display type.

**Brand essence:** “A clear, accountable record trail for authorized operations teams.” Personality: disciplined, calm, transparent.

**Brand voice:** Direct and factual; distinguish what was entered from what was independently verified. Example lines: “Every record, clearly accounted for.” “Status recorded by staff; external verification not provided.”

**Wordmark & logo:** Original compact ledger/check mark formed from two offset record lines and a single checked corner, paired with a clean CheckTrack wordmark. No bank emblem, currency symbol, or imitation instrument.

**Signature brand color:** Muted gold `#C0A36B`, used sparingly for focus and audit accents.

## Planned project structure

- `src/main.tsx` and `src/App.tsx` — React entrypoint, routes, public/authenticated layouts, role guards, access-denied and not-found states.
- `src/features/auth/` — Supabase session/profile context, invitation-only sign-in, password recovery, password update, and administrator TOTP enrollment/challenge screens.
- `src/features/layout/` — role-aware desktop/mobile application shell and page headers.
- `src/features/dashboard/` — database-derived totals, recent records and status activity.
- `src/features/records/` — record list/detail/create/edit/archive, workflow status changes, search, filters, sorting and server-side pagination.
- `src/features/reports/` — permission-aware report filters and CSV export UI.
- `src/features/users/` and `src/features/audit/` — administrator-managed membership/role screens and authorized audit history.
- `src/components/ui/` — shared accessible buttons, status badges, confirmation dialogs, loading/error/empty states.
- `src/lib/` — Supabase browser client, typed data access, validation, error handling, safe CSV export and formatting helpers.
- `supabase/migrations/` — schema, constraints, indexes, RLS policies, triggers and security hardening migrations.
- `supabase/functions/` — trusted user/role administration and export handlers.
- `supabase/tests/` — pgTAP tests for RLS, grants, transition enforcement and audit integrity; Vitest tests cover browser/domain behavior.
- Root/public files — Vite/Tailwind/TypeScript setup, pinned npm lockfile, `.env.example`, route manifest, Vercel SPA rewrite, setup README, and optional fictional seed data.
