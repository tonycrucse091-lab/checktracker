-- New Auth users must start as ordinary read-only accounts.
-- Administrator promotion remains a trusted service-side operation.
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

commit;
