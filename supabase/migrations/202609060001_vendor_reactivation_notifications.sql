-- A vendor's first publication and each later reactivation are separate feed
-- events. Existing RLS remains unchanged: only the service-role Node API can
-- read or write this table.
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in ('new_vendor', 'vendor_reactivated'));

-- Approved mock history for four individually-created suspended vendors.
-- This deliberately creates no notification rows. The six suspended vendors
-- that share bulk-import timestamps remain NULL and are not matched here.
update public.vendors
set published_at = created_at
where id in (
  '1381d638-a420-4c16-80b6-167337ae5bbf', -- Playwright Test Cafe
  '0f7cff30-4eda-4a2c-adce-462834e59707', -- Medan Selera Dataran Mat Riau
  'c4bbaeae-f313-48b2-87f0-6dcdd3894b2f', -- Lame Beker Mela Kraya
  '2b570cdc-9a9f-4848-a5c6-90bc4c18d784'  -- Lamille Bakers
)
  and status = 'suspended'
  and published_at is null;
