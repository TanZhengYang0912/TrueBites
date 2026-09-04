-- Dedicated notifications feed. Previously the bell derived "what's new" by
-- re-querying vendors for status = 'active' — that only ever covered one
-- event and couldn't tell a fresh activation from a re-save. Each row here is
-- one real event; `type` lets the feed grow to cover more than vendor
-- publishes later without changing the table shape.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('new_vendor')),
  vendor_id uuid references public.vendors(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Ordered-queue reads: newest first, everything older pushed down.
create index if not exists notifications_created_at_idx
  on public.notifications (created_at desc);

alter table public.notifications enable row level security;
-- No policies: only the Node API (service role) reads/writes this table,
-- same posture as vendor_suggestions — RLS here is defense in depth.
