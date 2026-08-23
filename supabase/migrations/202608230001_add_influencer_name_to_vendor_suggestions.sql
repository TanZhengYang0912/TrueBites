-- Optional attribution for the creator/channel behind a community suggestion.
-- Keep this separate from vendor_name: a vendor is the place being suggested;
-- the influencer is the source that recommended it.
alter table public.vendor_suggestions
  add column if not exists influencer_name text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'vendor_suggestions_influencer_name_length_check'
  ) then
    alter table public.vendor_suggestions
      add constraint vendor_suggestions_influencer_name_length_check
      check (influencer_name is null or char_length(influencer_name) <= 120);
  end if;
end;
$$;
