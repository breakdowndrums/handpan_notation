create table if not exists public.share_links (
  id text primary key,
  kind text not null default 'handpan-notation',
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.share_links enable row level security;

drop policy if exists "Share links are publicly readable" on public.share_links;
create policy "Share links are publicly readable"
on public.share_links
for select
using (kind in ('handpan-notation', 'handpan-arrangement'));

drop policy if exists "Anyone can create handpan share links" on public.share_links;
create policy "Anyone can create handpan share links"
on public.share_links
for insert
with check (kind in ('handpan-notation', 'handpan-arrangement'));
