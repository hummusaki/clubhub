BEGIN;

do $$
begin
  if not exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'announcements' and column_name = 'important') then
    alter table public.announcements add column important boolean not null default false;
    update public.announcements set important = true where lower(type) = 'urgent';
  end if;
end;
$$;

create table if not exists public.club_subscriptions (
  user_id uuid not null references public.users(id) on delete cascade,
  club_id text not null references public.clubs(id) on delete cascade
    check (club_id = lower(btrim(club_id)) and club_id !~ '^@'),
  events text not null default 'all' check (events in ('all', 'important', 'off')),
  announcements text not null default 'all' check (announcements in ('all', 'important', 'off')),
  primary key (user_id, club_id)
);

create table if not exists public.club_events (
  id uuid primary key default gen_random_uuid(),
  club_id text not null references public.clubs(id) on delete cascade,
  title text not null,
  start_at text not null,
  end_at text,
  all_day boolean not null default false,
  location text not null default '',
  important boolean not null default false,
  author_id uuid not null references public.users(id) on delete cascade
);
create index if not exists idx_club_events_club on public.club_events(club_id, start_at);

alter table public.club_subscriptions enable row level security;
drop policy if exists club_subscriptions_owner on public.club_subscriptions;
create policy club_subscriptions_owner on public.club_subscriptions
  for all to authenticated
  using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id() and public.is_club_member(club_id));

-- Update one channel without a read/modify/write cycle or dropping its sibling.
create or replace function public.set_club_subscription(club text, channel text, mode text)
returns void
language plpgsql security invoker set search_path = public
as $$
begin
  if mode not in ('all', 'important', 'off') or mode is null then
    raise exception 'Invalid subscription mode';
  end if;
  if channel = 'events' then
    insert into public.club_subscriptions(user_id, club_id, events)
    values (public.current_user_id(), club, mode)
    on conflict (user_id, club_id) do update set events = excluded.events;
  elsif channel = 'announcements' then
    insert into public.club_subscriptions(user_id, club_id, announcements)
    values (public.current_user_id(), club, mode)
    on conflict (user_id, club_id) do update set announcements = excluded.announcements;
  else
    raise exception 'Invalid subscription channel';
  end if;
end;
$$;
revoke execute on function public.set_club_subscription(text, text, text) from public;
grant execute on function public.set_club_subscription(text, text, text) to authenticated;

alter table public.club_events enable row level security;
drop policy if exists club_events_members on public.club_events;
create policy club_events_members on public.club_events
  for select to authenticated using (public.is_club_member(club_id));
drop policy if exists club_events_board on public.club_events;
create policy club_events_board on public.club_events
  for insert to authenticated with check (public.is_club_board(club_id) and author_id = public.current_user_id());

NOTIFY pgrst, 'reload schema';

COMMIT;
