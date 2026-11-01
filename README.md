# CheckTrack

CheckTrack is a responsive administrative record-tracking workspace. It records references, amounts, dates, roles, status changes, and audit history. It does not create negotiable checks, store bank account/routing details or check images, or independently verify that funds cleared.

This repository includes the frontend, PostgreSQL migrations/RLS, Supabase Edge Functions, local development configuration, and tests. **It does not contain or provision your Supabase project, Vercel deployment, credentials, email provider, or live records.** Until you configure a Supabase project and apply both migrations, live login and database totals are unavailable by design.

## Requirements

- Node.js 22.12 or later and npm 10.
- A Supabase account/project. The Edge Functions are deployed to Supabase; Vercel hosts only the static React frontend.
- Supabase CLI and Docker for local Supabase database/function tests.
- A GitHub repository and Vercel account if deploying the frontend.

## Install and run the frontend

```bash
npm ci
cp .env.example .env
```

Set only browser-safe values in `.env`:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PUBLIC_KEY
```

The publishable key is designed to be browser-visible. It is not a permission boundary: the SQL grants and RLS policies are. **Never** put a Supabase secret/service-role key in a `VITE_` variable, `.env.example`, frontend code, Git, or Vercel frontend variables.

Start the Supabase local stack first if you want database-backed development, then run:

```bash
npm run dev
```

Vite listens on `http://localhost:3000`. Without the two values above, the app intentionally shows a Supabase setup message and never fabricates dashboard data.

## Supabase local project, migrations, and tests

The committed `supabase/config.toml` disables public sign-up, requires email confirmation, and allows the local `http://localhost:3000/**` redirect. To use a local database and email simulator:

```bash
supabase start
supabase db reset
```

Copy the local API URL and publishable key printed by `supabase status` into `.env`. Supabase local development uses an email inbox simulator (Inbucket); open its URL from `supabase status` to follow invitations and password-reset messages.

Run the database permission suite only against a disposable local Supabase instance:

```bash
supabase test db
```

The pgTAP suite uses synthetic `.test` accounts and rolls back its fixtures. **Do not run database tests, resets, or destructive scripts against a production project.** The managed development/production database for an initialized hosted project can be shared; this repository avoids automatic seed data and destructive test runs.

## Supabase authentication and the first administrator

1. In Supabase Auth settings, enable email sign-up for the public read-only onboarding flow and keep email confirmations enabled. Set the **Site URL** to the complete URL including the protocol, for example `https://checktracker.vercel.app` (not `checktracker.vercel.app/`, which Supabase treats as a path). Add these **Redirect URLs**:

   ```text
   http://localhost:3000/**
   https://3000-ikfwdyftwza3twk787kpq-574c746f.us3.manus.computer/**
   https://checktracker.vercel.app/**
   ```

   Configure an SMTP provider for production email and set the production Site URL before inviting real users. Password reset redirects to `/set-password`; email confirmation redirects to `/sign-in` on the same origin where signup started.
2. Apply the versioned migrations to the intended Supabase project after checking its project reference and taking the backup required by your organization:

   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

   Confirm that **both** `20261021210000_checktrack_mvp.sql` and `20261021211000_checktrack_security_hardening.sql` are applied before using the app. The second migration enforces Administrator AAL2, hardens case-insensitive references, and locks role changes behind a trusted service function.
3. In Supabase Auth → Users, invite or create the first trusted administrator account. Have that person verify their email. Public self-registration remains disabled.
4. In the SQL editor for the **correct** project, replace the placeholder email and run this one-time bootstrap. It upgrades only that confirmed user's trigger-created default profile:

   ```sql
   do $$
   declare
     v_admin_id uuid;
   begin
     select id into v_admin_id
     from auth.users
     where lower(email) = lower('REPLACE_WITH_VERIFIED_ADMIN_EMAIL')
       and email_confirmed_at is not null;

     if v_admin_id is null then
       raise exception 'No verified Auth user matches the bootstrap email';
     end if;

     update public.profiles
     set role = 'administrator',
         account_status = 'active',
         can_export_records = false
     where user_id = v_admin_id;

     if not found then
       raise exception 'The profile for the verified Auth user was not found';
     end if;
   end $$;
   ```

   This is a trusted database-owner bootstrap; the associated profile audit row can have a null actor. Subsequent app-mediated changes are attributed to the authenticated administrator. Do not leave this placeholder unchanged or expose the SQL editor to ordinary app users.
5. Sign in as that administrator. CheckTrack requires Supabase TOTP AAL2 before administrator actions are enabled. Enroll an authenticator using `/mfa`; both the app and database enforce the AAL2 requirement.
6. From **Team access**, invite Staff or Read-only accounts. Administrator access for another user is assigned only by promoting an existing profile. Staff export permission is explicit and off by default. Public signup always creates read-only accounts; the stored profile role, not a signup field, controls the post-login workspace.

## Supabase Edge Functions

The frontend calls two JWT-verified functions:

- `team-admin`: administrator-only user listing/invitations/role/export-permission/account-status changes. It calls `admin_set_profile` through the server-side secret key.
- `export-records`: checks the signed-in profile and `can_export_records()` RPC, reads rows with the caller's JWT/RLS, applies validated filters, neutralizes spreadsheet formulas, and writes an export audit event before returning CSV. Exports are capped at 10,000 rows; archived exports are administrator-only.

Deploy to the same Supabase project as the database **after** applying migrations and verifying auth settings:

```bash
supabase functions deploy team-admin
supabase functions deploy export-records
```

The Supabase runtime injects its project URL and server API key. Set the CheckTrack-specific function secrets without putting them in source control:

```bash
supabase secrets set CHECKTRACK_SITE_URL=https://YOUR_PRODUCTION_HOST CHECKTRACK_ALLOWED_ORIGINS=https://YOUR_PRODUCTION_HOST
```

For a local Edge Function session, create `supabase/functions/.env.local` (ignored by Git) with the local `CHECKTRACK_SITE_URL=http://localhost:3000` and `CHECKTRACK_ALLOWED_ORIGINS=http://localhost:3000`, then run `supabase functions serve --env-file supabase/functions/.env.local`. Do not copy production secret/service-role values into the browser environment. The import map in `supabase/functions/deno.json` pins the function-side Supabase client to the same version as the app.

## Optional fictional local seed

`supabase/seed.sql` contains clearly fictional demonstration records. It is **not** enabled for automatic seeding. Create a verified local-only administrator with the email shown in the file, then run the seed SQL only against the local Supabase database. Never run this seed against a live organization or use the sample amounts as real transactions.

## Automated checks

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

The Vitest suite covers validation, workflow transition choices, CSV formula neutralization, and protected-route behavior. The pgTAP suite covers RLS/grants, role boundaries, administrator AAL1/AAL2, read-only restrictions, staff export permissions, history/audit triggers, status transitions, and archive access. Edge Function integration checks require a local Supabase stack; production service checks must use a separately approved test project, never production data.

Before opening an MVP to users, verify: public sign-up is disabled; first admin is confirmed and has a working TOTP AAL2 factor; direct table writes cannot change roles/status/archive/audit rows; read-only cannot edit by direct API/database calls; staff export is denied unless allowed; formula-like CSV text opens as text; inactive users are blocked by RLS; and migration backups/recovery have been tested on a separate disposable project.

## GitHub and Vercel frontend guide

This repository is configured as a static Vite app. `vercel.json` rewrites nested React Router pages to `index.html` and sets baseline response headers.

1. Push/host this code in the intended GitHub repository, then import that repository in Vercel.
2. Select Vite or configure **Build Command** `npm run build`, **Output Directory** `dist`, and Node.js 22.12+.
3. Add these environment variables to Vercel Production and the intended Preview environments:

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PUBLIC_KEY
   ```

   Use the Supabase project root URL, not the `/rest/v1/` URL. These two browser-safe values are public; never add a service-role or secret key to Vercel frontend variables.
4. Deploy the frontend. In Supabase Auth, set the Site URL to the production origin and add exact redirect patterns for localhost, the stable Preview host you actually use, the Vercel production hostname, and any verified custom domain.
5. Set `CHECKTRACK_SITE_URL` and `CHECKTRACK_ALLOWED_ORIGINS` as Supabase Edge Function secrets to the production origin(s); redeploy the functions after changing code. Do not allow untrusted origins. Function CORS compares exact origins.
6. Verify sign-in, password reset, invitation links, MFA, record RLS, status history, CSV permissions, and deep-link refresh on a non-production test account before inviting real users.

The app uses Supabase Auth's browser-managed session storage rather than an application cookie. Public signup remains off. Vercel deployment does not deploy the Supabase database or functions; these are separate release steps.

## Backups and restoration

Choose a Supabase backup/PITR approach appropriate to the project’s retention, compliance, and recovery objectives. Confirm which tables and auth data are covered in the selected plan. Take an authorized backup before applying schema migrations. Periodically perform a backup/export using the Supabase-supported method for your project plan, store it in an encrypted access-controlled location, and test restoration into a separate project. Verify schema, RLS, user provisioning, and a sample record workflow before any production cutover. Do not run a restore or bulk SQL script on production without a reviewed recovery plan and an explicit maintenance window.

## External references

See [`docs/security-and-platform-references.md`](docs/security-and-platform-references.md) for the official Vite, Supabase, and Vercel source links used for implementation.
