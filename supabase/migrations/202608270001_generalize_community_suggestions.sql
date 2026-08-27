-- Generalise community suggestions without renaming the existing compatibility table.
-- Vendor rows remain valid with suggestion_type = 'vendor'; creator rows keep
-- their profile details in the same admin-reviewed suggestion queue.

alter table public.vendor_suggestions
  add column if not exists suggestion_type text not null default 'vendor',
  add column if not exists source_kind text not null default 'video',
  add column if not exists creator_name text,
  add column if not exists creator_profile_url text,
  add column if not exists creator_sample_video_url text,
  add column if not exists creator_focus text,
  add column if not exists creator_audience text,
  add column if not exists creator_social_url text;

alter table public.vendor_suggestions
  alter column vendor_name drop not null,
  alter column source_url drop not null,
  alter column source_platform drop not null,
  alter column location_text drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'vendor_suggestions_type_check'
  ) then
    alter table public.vendor_suggestions
      add constraint vendor_suggestions_type_check
      check (suggestion_type in ('vendor', 'creator'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'vendor_suggestions_source_kind_check'
  ) then
    alter table public.vendor_suggestions
      add constraint vendor_suggestions_source_kind_check
      check (source_kind in ('video', 'profile'));
  end if;
end;
$$;

create index if not exists vendor_suggestions_type_created_idx
  on public.vendor_suggestions (suggestion_type, created_at desc);

create index if not exists vendor_suggestions_creator_name_idx
  on public.vendor_suggestions (lower(creator_name));
