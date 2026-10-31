-- Defense-in-depth follow-up for CheckTrack MVP. Safe to apply after the initial migration.
-- Admin capabilities require Supabase AAL2; the application enrolls/challenges TOTP factors.
-- Role/account changes are invoked only after trusted Edge Function authorization.

begin;

-- Make tracking references unique even if a client sends different letter casing.
create unique index if not exists check_records_tracking_reference_lower_uidx
  on public.check_records (lower(tracking_reference));

-- Match the specified timeline field name and retain verification time when a trusted source exists.
alter table public.check_status_history rename column record_id to check_record_id;
alter table public.check_status_history
  add column verification_timestamp timestamptz;

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
      and (
        p.role <> 'administrator'::public.app_role
        or (select auth.jwt() ->> 'aal') = 'aal2'
      )
  );
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
      and (
        (
          p.role = 'administrator'::public.app_role
          and (select auth.jwt() ->> 'aal') = 'aal2'
        )
        or (p.role = 'staff'::public.app_role and p.can_export_records)
      )
  );
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
    check_record_id, previous_status, new_status, actor_user_id, reason,
    verification_source, verification_timestamp
  ) values (
    new.id, old.status, new.status, (select auth.uid()), v_reason,
    new.verification_source, new.verification_timestamp
  );
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
      'check_record_id', new.check_record_id,
      'previous_status', new.previous_status::text,
      'new_status', new.new_status::text
    )
  );
  return new;
end;
$$;

-- The RPC is callable only from a trusted server using a Supabase secret/service key. The caller
-- identity is supplied only after the Edge Function validates the user's JWT, admin role and AAL2.
create or replace function public.admin_set_profile(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_role public.app_role,
  p_account_status public.account_status,
  p_can_export_records boolean
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_has_other_admin boolean;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'Trusted server authorization is required';
  end if;
  if p_actor_user_id is null or p_target_user_id is null then
    raise exception using errcode = '22023', message = 'A trusted actor and target user are required';
  end if;
  if p_target_user_id = p_actor_user_id
     and (p_role <> 'administrator'::public.app_role or p_account_status <> 'active'::public.account_status) then
    raise exception using errcode = '42501', message = 'Administrators cannot deactivate or demote themselves';
  end if;

  select * into v_profile
  from public.profiles
  where user_id = p_target_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Target profile was not found';
  end if;

  if v_profile.role = 'administrator'::public.app_role
     and v_profile.account_status = 'active'::public.account_status
     and (p_role <> 'administrator'::public.app_role or p_account_status <> 'active'::public.account_status) then
    select exists (
      select 1 from public.profiles
      where role = 'administrator'::public.app_role
        and account_status = 'active'::public.account_status
        and user_id <> p_target_user_id
    ) into v_has_other_admin;
    if not v_has_other_admin then
      raise exception using errcode = '23514', message = 'At least one active administrator must remain';
    end if;
  end if;

  -- The profile audit trigger uses this transaction-local, trusted actor for the audit row.
  perform pg_catalog.set_config('checktrack.audit_actor_id', p_actor_user_id::text, true);
  update public.profiles
  set role = p_role,
      account_status = p_account_status,
      can_export_records = p_can_export_records
  where user_id = p_target_user_id
  returning * into v_profile;
  return v_profile;
end;
$$;

create or replace function public.audit_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
begin
  v_actor := coalesce(
    (select auth.uid()),
    nullif(pg_catalog.current_setting('checktrack.audit_actor_id', true), '')::uuid
  );
  if tg_op = 'INSERT' then
    insert into public.audit_logs (actor_user_id, action, resource_type, resource_id, minimized_metadata)
    values (v_actor, 'profile.created', 'profile', new.user_id, '{}');
  elsif tg_op = 'UPDATE' then
    insert into public.audit_logs (actor_user_id, action, resource_type, resource_id, minimized_metadata)
    values (
      v_actor,
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

revoke all on function public.admin_set_profile(uuid, uuid, public.app_role, public.account_status, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_set_profile(uuid, uuid, public.app_role, public.account_status, boolean)
  to service_role;

commit;
