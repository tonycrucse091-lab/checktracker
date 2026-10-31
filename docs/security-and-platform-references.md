# Platform and security references

These sources informed the implementation. Check their current versions when creating a new Supabase/Vercel project because platform settings and API keys can change.

## React, Vite, and hosting

- [Vite Getting Started](https://vite.dev/guide/) documents the React/TypeScript scaffolds, Node.js compatibility (the current guide states Node 20.19+ or 22.12+), and the standard static production build.
- [Vercel: Vite](https://vercel.com/docs/frameworks/frontend/vite) documents project deployment, build/environment configuration, Git provider workflows, and the SPA rewrite needed for direct navigation to nested routes.

## Supabase security and auth

- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) explains that table grants and RLS policies are both necessary, that exposed tables must have RLS enabled, and that the `service_role` bypasses RLS. The migration therefore revokes broad grants as well as defining policies.
- [Supabase: Database Functions](https://supabase.com/docs/guides/database/functions) recommends `SECURITY INVOKER` by default; if `SECURITY DEFINER` is used, it must set a safe `search_path`, and function execution grants should be restricted.
- [Supabase: Edge Functions](https://supabase.com/docs/guides/functions) describes the TypeScript/Deno runtime, project secrets and server-side operations.
- [Supabase: Securing Edge Functions](https://supabase.com/docs/guides/functions/auth) documents JWT-verified user calls and the distinction between an RLS-scoped user client and a privileged admin client.
- [Supabase: Password-based Auth](https://supabase.com/docs/guides/auth/passwords) documents email/password sign-in, email confirmation, and the two-step reset/update-password flow. Hosted projects require verified email by default unless configured otherwise; custom SMTP is recommended for production email volume.
- [Supabase: User Management](https://supabase.com/docs/guides/auth/managing-user-data) documents keeping application profiles in a separately protected public table and the limits of user deletion/temporary bans for revoking already issued access tokens.
- [Supabase: API Keys](https://supabase.com/docs/guides/getting-started/api-keys) recommends a publishable key for browser code and a secret key only in trusted server components. Its current guidance notes the legacy `anon` and `service_role` keys are scheduled for deprecation by the end of 2026. Publishable keys are public and still require RLS; secret keys bypass RLS.
- [Supabase JavaScript: `inviteUserByEmail`](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail) marks Admin invite APIs as administrator operations; call them only from trusted server-side code.
