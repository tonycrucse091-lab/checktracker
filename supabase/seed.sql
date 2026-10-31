-- FICTIONAL LOCAL-DEVELOPMENT DEMONSTRATION DATA ONLY.
-- Never run this file against a real organization or a production database.
-- It is not enabled for automatic seeding. Create a local verified administrator at
-- checktrack-demo-admin@example.test, apply the migrations, then run this file locally.

do $$
declare
  v_creator uuid;
begin
  select p.user_id into v_creator
  from public.profiles as p
  join auth.users as u on u.id = p.user_id
  where lower(u.email) = 'checktrack-demo-admin@example.test'
    and p.role = 'administrator'
    and p.account_status = 'active'
  limit 1;

  if v_creator is null then
    raise exception 'Create the fictional local admin checktrack-demo-admin@example.test before running this seed';
  end if;

  insert into public.check_records (
    tracking_reference, payee_label, amount, currency, issue_date,
    expected_processing_date, status, notes, created_by, updated_by
  )
  select samples.tracking_reference, samples.payee_label, samples.amount,
         samples.currency, samples.issue_date, samples.expected_processing_date,
         samples.status::public.check_status, samples.notes, v_creator, v_creator
  from (values
    ('DEMO-001', 'Fictional Northwind Office Supply', 125.50::numeric, 'USD', date '2026-10-01', date '2026-10-07', 'draft', 'FICTIONAL LOCAL DEMO: awaiting review.'),
    ('DEMO-002', 'Fictional Cedar Works', 840.00::numeric, 'USD', date '2026-10-03', date '2026-10-09', 'issued', 'FICTIONAL LOCAL DEMO: no payment claim.'),
    ('DEMO-003', 'Fictional Harbor Stationery', 296.25::numeric, 'USD', date '2026-10-05', date '2026-10-12', 'pending', 'FICTIONAL LOCAL DEMO: illustrative tracking only.'),
    ('DEMO-004', 'Fictional Willow Facilities', 1540.75::numeric, 'USD', date '2026-10-08', date '2026-10-15', 'processing', 'FICTIONAL LOCAL DEMO: not a real transaction.'),
    ('DEMO-005', 'Fictional Acorn Print Studio', 412.00::numeric, 'USD', date '2026-10-10', date '2026-10-17', 'on_hold', 'FICTIONAL LOCAL DEMO: example hold.'),
    ('DEMO-006', 'Fictional Birchfield Services', 77.20::numeric, 'USD', date '2026-10-12', date '2026-10-19', 'returned', 'FICTIONAL LOCAL DEMO: no financial effect.')
  ) as samples(tracking_reference, payee_label, amount, currency, issue_date, expected_processing_date, status, notes)
  where not exists (
    select 1 from public.check_records as existing
    where lower(existing.tracking_reference) = lower(samples.tracking_reference)
  );
end $$;
