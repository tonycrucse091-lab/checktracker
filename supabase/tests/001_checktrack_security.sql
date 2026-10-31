-- CheckTrack database tests for `supabase test db`.
-- The identities below are synthetic local transaction fixtures, not credentials and not a remote project.
-- This file never connects to a live service; all fixture changes are rolled back at the end.

begin;
select no_plan();

-- Structural least-privilege and RLS assertions.
select ok(
  (select c.relrowsecurity from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'profiles'),
  'profiles has RLS enabled'
);
select ok(
  (select c.relrowsecurity from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'check_records'),
  'check_records has RLS enabled'
);
select ok(
  (select c.relrowsecurity from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'check_status_history'),
  'check_status_history has RLS enabled'
);
select ok(
  (select c.relrowsecurity from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'audit_logs'),
  'audit_logs has RLS enabled'
);
select ok(not has_table_privilege('anon', 'public.profiles', 'select'), 'anon cannot read profiles');
select ok(not has_table_privilege('anon', 'public.check_records', 'select'), 'anon cannot read records');
select ok(has_table_privilege('authenticated', 'public.check_records', 'select'), 'authenticated can select records');
select ok(not has_table_privilege('authenticated', 'public.check_records', 'update'), 'authenticated has no broad record update');
select ok(has_column_privilege('authenticated', 'public.check_records', 'notes', 'update'), 'staff-capable API has business-column update grant');
select ok(not has_column_privilege('authenticated', 'public.check_records', 'status', 'update'), 'browser cannot update status column');
select ok(not has_column_privilege('authenticated', 'public.check_records', 'archived_at', 'update'), 'browser cannot update archived_at');
select ok(not has_column_privilege('authenticated', 'public.check_records', 'verification_source', 'update'), 'browser cannot claim external verification');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'account_status', 'update'), 'browser cannot update account status');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'role', 'update'), 'browser cannot update profile role');
select ok(not has_table_privilege('authenticated', 'public.audit_logs', 'insert'), 'browser cannot insert audit logs');
select ok(has_function_privilege('authenticated', 'public.set_check_status(uuid,public.check_status,text)', 'execute'), 'authenticated can call status workflow');
select ok(has_function_privilege('authenticated', 'public.archive_check_record(uuid)', 'execute'), 'authenticated can call archive workflow');
select ok(not has_function_privilege('anon', 'public.set_check_status(uuid,public.check_status,text)', 'execute'), 'anon cannot call status workflow');
select ok(has_function_privilege('authenticated', 'public.user_has_any_role(public.app_role[])', 'execute'), 'safe role helper is intentionally available to RLS');
select ok(not has_function_privilege('anon', 'public.user_has_any_role(public.app_role[])', 'execute'), 'role helper is not available to anon');
select ok(not has_function_privilege('authenticated', 'public.admin_set_profile(uuid,uuid,public.app_role,public.account_status,boolean)', 'execute'), 'browser cannot use privileged profile updates');
select ok(has_function_privilege('service_role', 'public.admin_set_profile(uuid,uuid,public.app_role,public.account_status,boolean)', 'execute'), 'trusted service role can update profiles');

-- Complete transition matrix and terminal-state checks.
select is(public.is_valid_status_transition('draft', 'issued'), true, 'Draft -> Issued is valid');
select is(public.is_valid_status_transition('draft', 'cancelled'), true, 'Draft -> Cancelled is valid');
select is(public.is_valid_status_transition('issued', 'pending'), true, 'Issued -> Pending is valid');
select is(public.is_valid_status_transition('issued', 'on_hold'), true, 'Issued -> On Hold is valid');
select is(public.is_valid_status_transition('issued', 'cancelled'), true, 'Issued -> Cancelled is valid');
select is(public.is_valid_status_transition('pending', 'processing'), true, 'Pending -> Processing is valid');
select is(public.is_valid_status_transition('pending', 'on_hold'), true, 'Pending -> On Hold is valid');
select is(public.is_valid_status_transition('pending', 'cancelled'), true, 'Pending -> Cancelled is valid');
select is(public.is_valid_status_transition('processing', 'cleared'), true, 'Processing -> Cleared is valid');
select is(public.is_valid_status_transition('processing', 'returned'), true, 'Processing -> Returned is valid');
select is(public.is_valid_status_transition('processing', 'on_hold'), true, 'Processing -> On Hold is valid');
select is(public.is_valid_status_transition('on_hold', 'pending'), true, 'On Hold -> Pending is valid');
select is(public.is_valid_status_transition('on_hold', 'processing'), true, 'On Hold -> Processing is valid');
select is(public.is_valid_status_transition('on_hold', 'cancelled'), true, 'On Hold -> Cancelled is valid');
select is(public.is_valid_status_transition('cleared', 'draft'), false, 'Cleared is terminal');
select is(public.is_valid_status_transition('returned', 'pending'), false, 'Returned is terminal');
select is(public.is_valid_status_transition('cancelled', 'issued'), false, 'Cancelled is terminal');
select is(public.is_valid_status_transition('draft', 'processing'), false, 'Draft cannot skip workflow');

-- Local auth fixtures. The auth.users trigger creates default profiles; the postgres test owner
-- then configures their roles, as a trusted service would, without exposing browser write access.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'checktrack-admin@example.test', 'not-a-password', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'checktrack-staff@example.test', 'not-a-password', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'checktrack-readonly@example.test', 'not-a-password', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'checktrack-inactive@example.test', 'not-a-password', now(), now(), now())
on conflict (id) do nothing;
update public.profiles
set role = case user_id
  when '00000000-0000-0000-0000-000000000001' then 'administrator'::public.app_role
  when '00000000-0000-0000-0000-000000000002' then 'staff'::public.app_role
  when '00000000-0000-0000-0000-000000000003' then 'read_only'::public.app_role
  else 'staff'::public.app_role end,
  account_status = case when user_id = '00000000-0000-0000-0000-000000000004' then 'suspended'::public.account_status else 'active'::public.account_status end,
  can_export_records = (user_id = '00000000-0000-0000-0000-000000000002')
where user_id in (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000004'
);

-- Staff can create a record, but a duplicate tracking reference is rejected.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select lives_ok($sql$
  insert into public.check_records (
    tracking_reference, payee_label, amount, currency, issue_date, expected_processing_date, notes
  ) values ('TEST-STAFF-001', 'Fictional Payee', 125.50, 'USD', date '2026-01-01', date '2026-01-05', 'Synthetic fixture')
$sql$, 'staff can create a non-archived record with actor derived from auth.uid()');
select is(
  (select count(*) from public.check_records where tracking_reference = 'TEST-STAFF-001'),
  1::bigint,
  'staff-created record exists'
);
select throws_ok($sql$
  insert into public.check_records (
    tracking_reference, payee_label, amount, currency, issue_date, expected_processing_date
  ) values ('TEST-STAFF-001', 'Another Fictional Payee', 1.00, 'USD', date '2026-01-01', date '2026-01-05')
$sql$, '23505', null, 'duplicate tracking references are rejected');

-- Status workflow is transactional and creates actor-bound history and minimized audit rows.
select lives_ok($sql$
  select public.set_check_status(
    (select id from public.check_records where tracking_reference = 'TEST-STAFF-001'),
    'issued'::public.check_status,
    'Synthetic issue event'
  )
$sql$, 'staff can make a valid status transition');
select throws_ok($sql$
  select public.set_check_status(
    (select id from public.check_records where tracking_reference = 'TEST-STAFF-001'),
    'draft'::public.check_status,
    'Invalid synthetic reversal'
  )
$sql$, 'P0001', null, 'invalid status transition is rejected');
select lives_ok($sql$
  select public.set_check_status(
    (select id from public.check_records where tracking_reference = 'TEST-STAFF-001'),
    'pending'::public.check_status,
    'Synthetic pending event'
  )
$sql$, 'second valid status transition succeeds');
select is(
  (select count(*) from public.check_status_history h
   join public.check_records r on r.id = h.check_record_id
   where r.tracking_reference = 'TEST-STAFF-001'
     and h.previous_status = 'draft'
     and h.new_status = 'issued'
     and h.actor_user_id = '00000000-0000-0000-0000-000000000002'),
  1::bigint,
  'history stores the authenticated actor and transition'
);
select ok(
  (select count(*) >= 2 from public.audit_logs a
   join public.check_records r on r.id = a.resource_id
   where r.tracking_reference = 'TEST-STAFF-001'
     and a.resource_type = 'check_record'),
  'record actions create append-only audit rows'
);
select ok(
  (select count(*) >= 1 from public.audit_logs a
   where a.resource_type = 'check_status_history'
     and a.action = 'status_history.created'),
  'history insertion creates an audit row'
);

-- Direct status/archive changes are blocked by column grants, even for staff.
select throws_ok($sql$
  update public.check_records set status = 'cancelled'::public.check_status
  where tracking_reference = 'TEST-STAFF-001'
$sql$, '42501', null, 'staff cannot set status directly');
select throws_ok($sql$
  update public.check_records set archived_at = now()
  where tracking_reference = 'TEST-STAFF-001'
$sql$, '42501', null, 'staff cannot set archived_at directly');
select throws_ok($sql$
  update public.profiles set role = 'administrator'::public.app_role
  where user_id = '00000000-0000-0000-0000-000000000002'
$sql$, '42501', null, 'staff cannot mutate roles');
select throws_ok($sql$
  insert into public.audit_logs (action, resource_type, minimized_metadata)
  values ('forged.event', 'check_record', '{}')
$sql$, '42501', null, 'staff cannot insert audit logs');
select throws_ok($sql$
  update public.audit_logs set action = 'forged.updated'
$sql$, '42501', null, 'staff cannot update audit logs');
select throws_ok($sql$
  delete from public.audit_logs
$sql$, '42501', null, 'staff cannot delete audit logs');
select is(public.can_export_records(), true, 'staff export helper allows explicitly enabled staff');
reset role;

-- Read-only role can view records/history, but cannot write, export, or see other profiles.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
set local role authenticated;
select is(
  (select count(*) from public.check_records where tracking_reference = 'TEST-STAFF-001'),
  1::bigint,
  'read-only can view active records'
);
select is(
  (select count(*) from public.check_status_history h
   join public.check_records r on r.id = h.check_record_id
   where r.tracking_reference = 'TEST-STAFF-001'),
  2::bigint,
  'read-only can view status history'
);
select throws_ok($sql$
  insert into public.check_records (
    tracking_reference, payee_label, amount, currency, issue_date, expected_processing_date
  ) values ('TEST-READONLY-001', 'Fictional Read Only Payee', 2.00, 'USD', date '2026-01-01', date '2026-01-05')
$sql$, '42501', null, 'read-only cannot create records');
select throws_ok($sql$
  update public.check_records set notes = 'not allowed'
  where tracking_reference = 'TEST-STAFF-001'
$sql$, '42501', null, 'read-only cannot edit records');
select is(public.can_export_records(), false, 'read-only cannot export');
select is(
  (select count(*) from public.profiles where user_id in (
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003'
  )),
  1::bigint,
  'non-administrator profile isolation exposes only the caller profile'
);
reset role;

-- Administrator role checks require a verified AAL2 claim, not merely a stored role value.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is(public.can_export_records(), false, 'AAL1 administrator cannot export');
select throws_ok($sql$
  select public.set_check_status(
    (select id from public.check_records where tracking_reference = 'TEST-STAFF-001'),
    'processing'::public.check_status,
    'AAL1 administrator attempt'
  )
 $sql$, '42501', null, 'AAL1 administrator cannot change status');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select is(public.can_export_records(), true, 'AAL2 administrator is export-eligible');
select lives_ok($sql$
  select public.set_check_status(
    (select id from public.check_records where tracking_reference = 'TEST-STAFF-001'),
    'processing'::public.check_status,
    'AAL2 administrator transition'
  )
$sql$, 'AAL2 administrator can use the controlled status workflow');
reset role;

-- Suspended users have no record access, even if their stored role is staff.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
set local role authenticated;
select is(
  (select count(*) from public.check_records where tracking_reference = 'TEST-STAFF-001'),
  0::bigint,
  'suspended profile cannot view records'
);
select throws_ok($sql$
  insert into public.check_records (
    tracking_reference, payee_label, amount, currency, issue_date, expected_processing_date
  ) values ('TEST-INACTIVE-001', 'Fictional Inactive Payee', 2.00, 'USD', date '2026-01-01', date '2026-01-05')
$sql$, '42501', null, 'suspended profile cannot create records');
select is(public.can_export_records(), false, 'suspended profile cannot export');
reset role;

-- Only an administrator can archive; archived rows disappear from staff/read-only views.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select lives_ok($sql$
  select public.archive_check_record(
    (select id from public.check_records where tracking_reference = 'TEST-STAFF-001')
  )
$sql$, 'administrator can archive through the checked function');
select is(
  (select count(*) from public.check_records where tracking_reference = 'TEST-STAFF-001'),
  1::bigint,
  'administrator can view archived records'
);
select is(public.can_export_records(), true, 'administrator is export-eligible');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select is(
  (select count(*) from public.check_records where tracking_reference = 'TEST-STAFF-001'),
  0::bigint,
  'staff cannot view archived records'
);
select throws_ok($sql$
  select public.archive_check_record(
    (select id from public.check_records where tracking_reference = 'TEST-STAFF-001')
  )
$sql$, 'P0002', null, 'staff cannot archive');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
set local role authenticated;
select is(
  (select count(*) from public.check_records where tracking_reference = 'TEST-STAFF-001'),
  0::bigint,
  'read-only cannot view archived records'
);
reset role;

select * from finish();
rollback;
