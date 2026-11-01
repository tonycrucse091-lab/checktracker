-- Repair Auth users created before profile provisioning was applied.
-- Every existing Auth user receives a least-privilege active read-only profile only
-- when that profile is missing. Administrator promotion remains trusted-only.
begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    user_id,
    display_name,
    role,
    account_status,
    can_export_records
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    'read_only'::public.app_role,
    'active'::public.account_status,
    false
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists auth_user_profile on auth.users;
create trigger auth_user_profile
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (
  user_id,
  display_name,
  role,
  account_status,
  can_export_records
)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'display_name', ''),
  'read_only'::public.app_role,
  'active'::public.account_status,
  false
from auth.users as u
where not exists (
  select 1
  from public.profiles as p
  where p.user_id = u.id
);

commit;
