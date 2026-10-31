# CheckTrack MVP — TODO

The criteria below preserve the approved scope and the original brief. Items remain open until there is evidence they are implemented; live service-dependent criteria remain open until configured and verified.

## 1. Responsive dashboard with real database totals
- [ ] Build a responsive dashboard with database-derived summary cards for Total records, Pending records, Processing records, Cleared records, Returned records, On Hold records, and Recently updated records. Do not hard-code totals. Do not create fake financial transactions to make the dashboard appear populated. Any development seed records must be clearly marked fictional demonstration data.
- [ ] Include recent activity, quick search, status filters, date-range filters, a Create Record action for authorized users, and a recent-records table.
- [ ] Include loading, skeleton, empty, error, and success feedback states. Without a configured database, show a clear configuration/connection state rather than invented totals or records.

## 2. Sign-in, sign-out, password recovery, and protected pages
- [ ] Implement sign-in and sign-out, verified email-based account access, password reset, protected application routes, and session handling using Supabase Auth, not a custom password system.
- [ ] Disable open public sign-up by default. Provide administrator-controlled user provisioning or invitation and account deactivation. An unauthorized visitor must not be able to access the dashboard, records, reports, or user-management screens.
- [ ] Administrators must complete Supabase AAL2 using a TOTP authenticator before administrator-only actions are available. Enforce this in database role helpers and trusted Edge Functions as well as in the interface; do not rely on client-only navigation. Staff and Read-only accounts do not require administrator MFA.
- [ ] Build Sign-in, Password reset, Access Denied, and Not Found pages. Expired sessions and unauthorized access must produce clear, user-friendly states.

## 3. Administrator, Staff, and Read-only roles
- [ ] Enforce role permissions on the server and through PostgreSQL Row Level Security. Hiding a button in the frontend is not a security control.
- [ ] **Administrator:** manage authorized users and roles; view all records within the configured organization; create, edit, archive, and update statuses; view audit history; export authorized reports; review security-relevant events.
- [ ] **Staff:** create records; view records they are authorized to access; edit permitted fields; update statuses where permitted; view record history; export records only if authorized.
- [ ] **Read-only:** view authorized records and histories; cannot create, edit, archive, or change status; cannot manage users or permissions. Under the approved plan, read-only users cannot export.
- [ ] Approved MVP access assumption: one organization, no record-level assignments or multi-organization tenancy; staff and read-only users can see all records in this organization. Staff cannot archive or manage users. Administrator export is allowed; Staff export requires explicit permission.
- [ ] Do not trust role values or user IDs supplied by the browser; prevent ordinary users from assigning themselves administrator privileges. Validate roles and permissions on the server. Protect privileged operations with server-side authorization.

## 4. Create, view, edit, and archive check records
- [ ] Implement create, view, edit, and archive workflows, with confirmation for sensitive/destructive operations and permission enforcement.
- [ ] Each record includes: automatically generated opaque internal record ID; unique non-sensitive tracking reference; payee name or label only where required; amount; currency code; issue date; expected processing date; current status; optional administrative notes; created by; creation timestamp; last updated by; last updated timestamp; optional verification source and verification timestamp.
- [ ] Use database constraints for required fields, unique references, valid amounts, and allowed values; use foreign keys, appropriate timestamp defaults, and indexes on tracking reference, status, creation date, and other commonly searched fields.
- [ ] Do not use bank account numbers or other sensitive financial information as public identifiers. Do not store full account numbers, routing numbers, passwords, signatures, security codes, or actual check images in the MVP.
- [ ] A record status label is not independent proof that funds have cleared. Clearly distinguish manually recorded statuses from statuses verified through an authorized external source.
- [ ] The product manages administrative records only. It must not generate negotiable checks, imitate official bank-issued cashier’s checks, create fake bank documents, or claim a payment is verified without an authorized source.

## 5. Controlled status updates and history timeline
- [ ] Support Draft, Issued, Pending, Processing, Cleared, Returned, Cancelled, and On Hold.
- [ ] Validate status transitions on the server and restrict transitions that are not allowed by the approved workflow:
  - Draft → Issued or Cancelled.
  - Issued → Pending, On Hold, or Cancelled.
  - Pending → Processing, On Hold, or Cancelled.
  - Processing → Cleared, Returned, or On Hold.
  - On Hold → Pending, Processing, or Cancelled.
  - Cleared, Returned, and Cancelled are terminal statuses.
- [ ] Every status change appends a history record containing record ID, previous status, new status, actor’s authenticated user ID, timestamp, optional reason, and verification details where applicable. Provide a status timeline on record details.
- [ ] Record Cleared/Returned as manually entered unless an authorized verification source is separately recorded. A status label alone is not proof that funds have cleared.

## 6. Search, filters, sorting, and pagination
- [ ] Search by internal ID or tracking reference.
- [ ] Filter by status, date range, currency, and authorized staff member.
- [ ] Sort by date, amount, status, and latest update.
- [ ] Implement server-side pagination and preserve filters across results/navigation where appropriate.

## 7. CSV export with permission checks
- [ ] Provide CSV export only where authorized, and ensure exports respect each user’s record-access permissions and active filters.
- [ ] Administrator can export authorized reports; Staff can export only if explicitly authorized; Read-only cannot export under the approved plan.
- [ ] Prevent spreadsheet formula injection in exported text fields. Do not export secrets or unnecessary sensitive data.
- [ ] Log report exports in the audit log. Show clear error messages for failed exports.

## 8. Database schema, migrations, Row Level Security, and audit integrity
- [ ] Create version-controlled PostgreSQL SQL migrations for `profiles` with: `user_id` referencing the authenticated user, `display_name`, `role`, `account_status`, `can_export_records` (explicit Staff-export permission), `created_at`, `updated_at`.
- [ ] Create `check_records` with: `id`, `tracking_reference`, `payee_label`, `amount`, `currency`, `issue_date`, `expected_processing_date`, `status`, `notes`, `created_by`, `created_at`, `updated_by`, `updated_at`, `archived_at`.
- [ ] Create `check_status_history` with: `id`, `check_record_id`, `previous_status`, `new_status`, `actor_user_id`, `reason`, `verification_source`, optional `verification_timestamp`, `created_at`.
- [ ] Create `audit_logs` with: `id`, `actor_user_id`, `action`, `resource_type`, `resource_id`, `minimized_metadata`, `created_at`.
- [ ] Enable Row Level Security on all tables containing private application data. Write explicit, tested SELECT, INSERT, UPDATE, and DELETE policies as appropriate. Deny access by default. Enforce the approved one-organization data boundary in policies.
- [ ] Ordinary application users cannot rewrite or delete audit entries; keep privileged database access tightly restricted. Capture authenticated actor and timestamp on the trusted server or database side.
- [ ] Log record creation, record edits, status changes, archiving, report exports, user/role changes, and failed or denied privileged operations where feasible. Do not record passwords, tokens, or unnecessary financial details.
- [ ] Include an organization identifier in records and access policies if the application supports multiple independent teams or organizations. The approved MVP is one organization and does not implement multi-organization tenancy.

## 9. Input validation, user-friendly error handling, accessibility, and interface pages
- [ ] Validate input on both client and server; sanitize user input; use safe database queries and avoid SQL injection. Apply reasonable request rate limits.
- [ ] Show clear messages for missing required fields, invalid amounts or dates, duplicate tracking references, unauthorized access, invalid status transitions, expired sessions, network errors, database errors, and failed exports.
- [ ] Include loading states and prevent accidental duplicate submissions.
- [ ] Build these pages: Sign-in; Password reset; Dashboard; All Records; Create Record page or modal; Record Details page with status timeline; Edit Record; Reports and Exports; User Management for administrators; Audit History for authorized users; Access Denied; Not Found. Use reusable components and a consistent application shell.
- [ ] Meet the supplied design direction: professional, restrained, executive and clean; use midnight navy `#172638`, charcoal `#34383D`, warm ivory `#F5F1E8`, muted gold `#C0A36B`, and white content areas. Provide clear hierarchy, readable typography, compact tables with generous spacing, consistent status labels, accessible contrast and keyboard navigation, responsive desktop/tablet/mobile layouts, desktop sidebar and mobile-friendly navigation, loading indicators/skeletons/empty/error/success states, confirmation dialogs for destructive/sensitive actions, and reduced-motion support.
- [ ] Do not copy a real bank’s branding or use a real bank logo without authorization.

## 10. Setup instructions, Supabase, GitHub, Vercel, and recovery
- [x] Deliver complete React/Vite/TypeScript source code, reusable UI components, SQL migrations and RLS policies, trusted server-side functions for privileged operations, `.env.example` with placeholders and no real secrets, clearly labeled fictional development seed script, README with local setup, Supabase setup instructions, GitHub and Vercel deployment guide, database backup/restoration notes, security testing checklist, and automated tests for core workflows.
- [ ] Use React, Vite, TypeScript, Tailwind CSS, and an accessible component library such as shadcn/ui; Supabase, PostgreSQL, Supabase Auth, PostgreSQL RLS, and Supabase Edge Functions or another trusted server-side layer for privileged operations; Vercel frontend hosting and GitHub source control. Use compatible stable package versions and include a lockfile.
- [ ] Never expose a database service-role key, privileged API key, or other secret in browser code. Use environment variables and placeholders only in `.env.example`. Keep service-role secrets server-side only. Require HTTPS in production.
- [x] Document: installing dependencies; creating a Supabase project; configuring environment variables; applying SQL migrations; securely creating the first administrator; running the app locally; running tests; running the production build; connecting GitHub to Vercel; deploying the frontend; testing authentication, database permissions, and recovery; configuring database backups and restoration.
- [x] Use `npm run build` for the production build. Fix build and type errors before declaring the project complete.
- [x] Do not claim the website is deployed, tested, or production-ready unless those steps have actually been performed. A live database, authentication, and database-derived totals remain dependent on configuring an actual Supabase project. The approved task provides a deployment guide and does not authorize publishing or switching the GitHub repository.

## 11. Automated verification of core workflows and security
- [ ] Include tests for authentication flows, role permissions, Row Level Security policies, record creation and editing, duplicate tracking references, status transitions, audit history creation, search and filtering, CSV export authorization, cross-user record isolation and (if multi-organization support is enabled) cross-organization isolation, mobile responsiveness, empty states, and error states. For this approved single-organization MVP, verify isolation between roles/users within the organization; multi-organization tenancy is not enabled.
- [ ] Verify that a Read-only user cannot edit a record by calling the database or API directly.
- [x] Include a security testing checklist; document test prerequisites and distinguish code-level results from service tests that need a configured Supabase project.

## 12. Final acceptance
- [ ] An authorized administrator can sign in, create and manage records, review status history, search records, export an authorized report, and manage staff permissions.
- [ ] Unauthorized users are blocked at the database/API layer, not merely by the interface.
- [x] If any required configuration depends on external credentials, document exactly what must be configured and never invent credentials.
