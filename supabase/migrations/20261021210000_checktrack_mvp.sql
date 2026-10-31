-- CheckTrack MVP: one organization, active users only, no account/routing numbers or images.
-- Security model: browser roles receive only the table columns and RPCs they need.
-- Role/account-status/export changes belong in a trusted Edge Function using service credentials;
-- they are intentionally not writable by anon/authenticated and are not exposed as browser RPCs.

begin;

create extension if not exists pgcrypto;

create type public.app_role as enum ('administrator', 'staff', 'read_only');
create type public.account_status as enum ('active', 'suspended', 'disabled');
create type public.check_status as enum (
  'draft',
  'issued',
  'pending',
  'processing',
  'on_hold',
  'cleared',
  'returned',
  'cancelled'
);

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 160),
  role public.app_role not null default 'read_only',
  account_status public.account_status not null default 'active',
  -- This flag is meaningful only for staff. Administrators are export-eligible by policy.
  can_export_records boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_admin_export_flag_ck
    check (role = 'staff' or can_export_records = false)
);

create table public.check_records (
  id uuid primary key default gen_random_uuid(),
  tracking_reference text not null unique
    check (tracking_reference ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$'),
  payee_label text not null
    check (char_length(btrim(payee_label)) between 1 and 200),
  amount numeric(14,2) not null check (amount > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  issue_date date not null,
  expected_processing_date date not null,
  status public.check_status not null default 'draft',
  notes text check (notes is null or char_length(notes) <= 2000),
  verification_source text check (verification_source is null or char_length(verification_source) <= 120),
  verification_timestamp timestamptz,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint check_records_expected_date_ck check (expected_processing_date >= issue_date),
  constraint check_records_verification_pair_ck check (
    (verification_source is null and verification_timestamp is null)
    or (verification_source is not null and verification_timestamp is not null)
  )
);

create table public.check_status_history (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.check_records (id) on delete restrict,
  previous_status public.check_status,
  new_status public.check_status not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  reason text check (reason is null or char_length(reason) <= 1000),
  verification_source text check (verification_source is null or char_length(verification_source) <= 120),
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null check (action ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  resource_type text not null check (resource_type in ('profile', 'check_record', 'check_status_history', 'report_export', 'security_event')),
  resource_id uuid,
  minimized_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(minimized_metadata) = 'object' and pg_column_size(minimized_metadata) <= 4096),
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'Role/account_status/can_export_records are service-managed; browser clients may only update display_name.';
comment on table public.check_records is
  'Deliberately excludes account/routing numbers and check images. Status and archive changes use trusted workflow RPCs.';
comment on column public.check_records.verification_source is
  'Null unless a separately trusted integration records external verification; manual Cleared/Returned changes do not populate it.';
comment on table public.audit_logs is
  'Append-only records written by SECURITY DEFINER triggers; ordinary app users have no INSERT/UPDATE/DELETE privilege.';

create index check_records_active_reference_idx
  on public.check_records (tracking_reference)
  where archived_at is null;
create index check_records_active_status_idx
  on public.check_records (status, expected_processing_date)
  where archived_at is null;
create index check_records_created_by_idx on public.check_records (created_by);
create index check_status_history_record_created_idx
  on public.check_status_history (record_id, created_at desc);
create index audit_logs_resource_created_idx
  on public.audit_logs (resource_type, resource_id, created_at desc);
create index profiles_role_status_idx on public.profiles (role, account_status);

-- These helpers run as the migration owner, bypassing profile RLS only for the one role lookup
-- they perform. The empty search_path and fully qualified names prevent search_path hijacking.
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as p
    where p.user_id = (select auth.uid())
      and p.account_status = 'active'::public.account_status
  );
$$;

create or replace function public.user_has_any_role(p_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as p
    where p.user_id = (select auth.uid())
      and p.account_status = 'active'::public.account_status
      and p.role = any (p_roles)
  );
$$;

create or replace function public.is_administrator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.user_has_any_role(array['administrator'::public.app_role]);
$$;

create or replace function public.can_export_records()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as p
    where p.user_id = (select auth.uid())
      and p.account_status = 'active'::public.account_status
      and (p.role = 'administrator'::public.app_role
           or (p.role = 'staff'::public.app_role and p.can_export_records))
  );
$$;

create or replace function public.is_valid_status_transition(
  p_previous public.check_status,
  p_next public.check_status
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_previous = p_next then true
    when p_previous = 'draft' and p_next in ('issued', 'cancelled') then true
    when p_previous = 'issued' and p_next in ('pending', 'on_hold', 'cancelled') then true
    when p_previous = 'pending' and p_next in ('processing', 'on_hold', 'cancelled') then true
    when p_previous = 'processing' and p_next in ('cleared', 'returned', 'on_hold') then true
    when p_previous = 'on_hold' and p_next in ('pending', 'processing', 'cancelled') then true
    else false
  end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create or replace function public.prepare_check_record_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.updated_by := coalesce((select auth.uid()), new.updated_by, new.created_by);
    if new.created_by is null then
      raise exception using errcode = '22023', message = 'A trusted actor is required to create a check record';
    end if;
  elsif (select auth.uid()) is not null then
    new.updated_by := (select auth.uid());
  end if;
  return new;
end;
$$;

create or replace function public.enforce_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_valid_status_transition(old.status, new.status) then
    raise exception using
      errcode = 'P0001',
      message = format('Invalid check status transition: %s -> %s', old.status, new.status);
  end if;
  return new;
end;
$$;

create or replace function public.append_status_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
begin
  v_reason := nullif(current_setting('checktrack.status_reason', true), '');
  insert into public.check_status_history (
    record_id, previous_status, new_status, actor_user_id, reason, verification_source
  ) values (
    new.id, old.status, new.status, (select auth.uid()), v_reason, new.verification_source
  );
  return new;
end;
$$;

create or replace function public.audit_record_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
  v_resource_id uuid;
  v_metadata jsonb;
begin
  if tg_op = 'INSERT' then
    v_action := 'record.created';
    v_resource_id := new.id;
    v_metadata := pg_catalog.jsonb_build_object('status', new.status::text);
  elsif tg_op = 'UPDATE' then
    v_action := 'record.updated';
    v_resource_id := new.id;
    v_metadata := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'old_status', case when old.status is distinct from new.status then old.status::text end,
      'new_status', case when old.status is distinct from new.status then new.status::text end,
      'archived', case when old.archived_at is distinct from new.archived_at then (new.archived_at is not null) end
    ));
  else
    v_action := 'record.deleted';
    v_resource_id := old.id;
    v_metadata := '{}'::jsonb;
  end if;

  insert into public.audit_logs (actor_user_id, action, resource_type, resource_id, minimized_metadata)
  values ((select auth.uid()), v_action, 'check_record', v_resource_id, v_metadata);
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.audit_history_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (actor_user_id, action, resource_type, resource_id, minimized_metadata)
  values (
    new.actor_user_id,
    'status_history.created',
    'check_status_history',
    new.id,
    pg_catalog.jsonb_build_object(
      'record_id', new.record_id,
      'previous_status', new.previous_status::text,
      'new_status', new.new_status::text
    )
  );
  return new;
end;
$$;

create or replace function public.audit_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs (actor_user_id, action, resource_type, resource_id, minimized_metadata)
    values ((select auth.uid()), 'profile.created', 'profile', new.user_id, '{}');
  elsif tg_op = 'UPDATE' then
    insert into public.audit_logs (actor_user_id, action, resource_type, resource_id, minimized_metadata)
    values (
      (select auth.uid()),
      'profile.updated',
      'profile',
      new.user_id,
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'role_changed', old.role is distinct from new.role,
        'account_status_changed', old.account_status is distinct from new.account_status,
        'export_permission_changed', old.can_export_records is distinct from new.can_export_records
      ))
    );
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.set_check_status(
  p_record_id uuid,
  p_new_status public.check_status,
  p_reason text default null
)
returns public.check_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record public.check_records;
begin
  if not public.is_active_user()
     or not public.user_has_any_role(array['administrator'::public.app_role, 'staff'::public.app_role]) then
    raise exception using errcode = '42501', message = 'An active administrator or staff actor is required';
  end if;
  if p_reason is not null and char_length(p_reason) > 1000 then
    raise exception using errcode = '22001', message = 'Status reason is too long';
  end if;

  select * into v_record
  from public.check_records
  where id = p_record_id
    and archived_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Check record not found or archived';
  end if;
  if v_record.status = p_new_status then
    raise exception using errcode = 'P0001', message = 'Check record is already in that status';
  end if;
  if not public.is_valid_status_transition(v_record.status, p_new_status) then
    raise exception using errcode = 'P0001', message = 'Status transition is not permitted';
  end if;

  -- This workflow intentionally never accepts verification_source/timestamp parameters.
  -- Manual Cleared/Returned changes therefore remain unverified (both fields stay null).
  perform pg_catalog.set_config('checktrack.status_reason', coalesce(p_reason, ''), true);
  update public.check_records
  set status = p_new_status
  where id = p_record_id
  returning * into v_record;
  return v_record;
end;
$$;

create or replace function public.archive_check_record(p_record_id uuid)
returns public.check_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record public.check_records;
begin
  if not public.is_active_user() or not public.is_administrator() then
    raise exception using errcode = '42501', message = 'An active administrator actor is required';
  end if;
  update public.check_records
  set archived_at = clock_timestamp()
  where id = p_record_id
    and archived_at is null
  returning * into v_record;
  if not found then
    raise exception using errcode = 'P0002', message = 'Check record not found or already archived';
  end if;
  return v_record;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();
create trigger profiles_audit
after insert or update on public.profiles
for each row execute function public.audit_profile_changes();
create trigger check_records_actor
before insert or update on public.check_records
for each row execute function public.prepare_check_record_actor();
create trigger check_records_updated_at
before update on public.check_records
for each row execute function public.set_updated_at();
create trigger check_records_transition_guard
before update of status on public.check_records
for each row when (old.status is distinct from new.status)
execute function public.enforce_status_transition();
create trigger check_records_history
after update of status on public.check_records
for each row when (old.status is distinct from new.status)
execute function public.append_status_history();
create trigger check_records_audit
after insert or update or delete on public.check_records
for each row execute function public.audit_record_changes();
create trigger status_history_audit
after insert on public.check_status_history
for each row execute function public.audit_history_insert();
create trigger auth_user_profile
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.check_records enable row level security;
alter table public.check_status_history enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select on public.profiles
for select to authenticated
using (
  (user_id = (select auth.uid()) and account_status = 'active'::public.account_status)
  or public.is_administrator()
);
create policy profiles_update_display_name on public.profiles
for update to authenticated
using (user_id = (select auth.uid()) and account_status = 'active'::public.account_status)
with check (user_id = (select auth.uid()) and account_status = 'active'::public.account_status);

create policy records_select on public.check_records
for select to authenticated
using (
  public.is_active_user()
  and (archived_at is null or public.is_administrator())
);
create policy records_insert on public.check_records
for insert to authenticated
with check (
  public.is_active_user()
  and public.user_has_any_role(array['administrator'::public.app_role, 'staff'::public.app_role])
  and created_by = (select auth.uid())
);
create policy records_update_business_fields on public.check_records
for update to authenticated
using (
  public.is_active_user()
  and archived_at is null
  and public.user_has_any_role(array['administrator'::public.app_role, 'staff'::public.app_role])
)
with check (
  public.is_active_user()
  and archived_at is null
  and public.user_has_any_role(array['administrator'::public.app_role, 'staff'::public.app_role])
);

create policy history_select on public.check_status_history
for select to authenticated
using (
  public.is_active_user()
  and exists (
    select 1 from public.check_records as r
    where r.id = record_id
      and (r.archived_at is null or public.is_administrator())
  )
);

create policy audit_select_administrator on public.audit_logs
for select to authenticated
using (public.is_administrator());

-- Revoke before grant is intentional: Supabase's default API roles must not inherit broad table,
-- function, or future-object privileges. No browser role gets direct role/status/archive/audit writes.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
revoke all on public.profiles, public.check_records, public.check_status_history, public.audit_logs from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
revoke all on type public.app_role, public.account_status, public.check_status from public, anon, authenticated;

grant usage on type public.app_role, public.account_status, public.check_status to authenticated;
grant select on public.profiles, public.check_records, public.check_status_history, public.audit_logs to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant insert (
  tracking_reference, payee_label, amount, currency, issue_date,
  expected_processing_date, notes
) on public.check_records to authenticated;
grant update (
  tracking_reference, payee_label, amount, currency, issue_date,
  expected_processing_date, notes
) on public.check_records to authenticated;
grant execute on function public.set_check_status(uuid, public.check_status, text) to authenticated;
grant execute on function public.archive_check_record(uuid) to authenticated;
grant execute on function public.can_export_records() to authenticated;
-- These three helpers are narrowly scoped booleans required by RLS expressions; they disclose no rows.
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.user_has_any_role(public.app_role[]) to authenticated;
grant execute on function public.is_administrator() to authenticated;

-- Trigger helpers and transition validation are deliberately not callable through PostgREST;
-- only the three boolean helpers needed to evaluate RLS were granted above.
revoke all on function public.is_active_user() from public, anon;
revoke all on function public.user_has_any_role(public.app_role[]) from public, anon;
revoke all on function public.is_administrator() from public, anon;
revoke all on function public.is_valid_status_transition(public.check_status, public.check_status) from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.prepare_check_record_actor() from public, anon, authenticated;
revoke all on function public.enforce_status_transition() from public, anon, authenticated;
revoke all on function public.append_status_history() from public, anon, authenticated;
revoke all on function public.audit_record_changes() from public, anon, authenticated;
revoke all on function public.audit_history_insert() from public, anon, authenticated;
revoke all on function public.audit_profile_changes() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

commit;
