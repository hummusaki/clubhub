-- ============================================================================
-- ClubHub Cloud Database Schema & Strict Row Level Security (Supabase Postgres)
-- ============================================================================
-- Run this script in the Supabase SQL Editor (https://supabase.com/dashboard).
-- Enforces two-tier RBAC (Board/Leadership vs. Regular Members), atomic roster
-- position claiming, real-user poll responses, sub-groups, and Monday.com tasks.

create extension if not exists pgcrypto;

-- ── 0. Updated-At Trigger Utility ───────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ── 1. USERS (Supports both Supabase Auth & Clerk Third-Party Auth JWTs) ────
create table if not exists public.users (
  id               uuid primary key default gen_random_uuid(),
  external_auth_id text unique,
  email            text unique not null,
  full_name        text not null default '',
  major            text not null default '',
  grad_year        text not null default '',
  avatar_bg        text not null default 'linear-gradient(135deg, var(--blue), var(--purple))',
  theme_mode       text not null default 'system' check (theme_mode in ('system', 'light', 'dark')),
  verified_edu     boolean not null default false,
  created_at       timestamptz not null default timezone('utc', now()),
  updated_at       timestamptz not null default timezone('utc', now())
);

-- Safe in-place migration if `public.users` was created with an earlier `auth.users` FK
alter table public.users add column if not exists external_auth_id text unique;
alter table public.users add column if not exists theme_mode text not null default 'system';
alter table public.users alter column id set default gen_random_uuid();
alter table public.users drop constraint if exists users_id_fkey;

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, verified_edu)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, 'member'), '@', 1)),
    lower(coalesce(new.email, '')) like '%.edu'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(excluded.full_name, ''), public.users.full_name),
        verified_edu = excluded.verified_edu;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ── 2. CLUBS ────────────────────────────────────────────────────────────────
create table if not exists public.clubs (
  id               text primary key,
  name             text not null,
  category         text not null default 'academic',
  description      text not null default '',
  official_email   text not null default '',
  instagram        text not null default '',
  website          text not null default '',
  roster_positions jsonb not null default '[]'::jsonb,
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default timezone('utc', now()),
  updated_at       timestamptz not null default timezone('utc', now())
);

drop trigger if exists trg_clubs_updated_at on public.clubs;
create trigger trg_clubs_updated_at
  before update on public.clubs
  for each row execute function public.set_updated_at();

-- ── 3. CLUB_MEMBERS (with RBAC `role` & `claimed_position`) ─────────────────
create table if not exists public.club_members (
  id                  uuid primary key default gen_random_uuid(),
  club_id             text not null references public.clubs(id) on delete cascade,
  user_id             uuid not null references public.users(id) on delete cascade,
  role                text not null default 'member' check (role in ('member', 'board', 'president')),
  role_title          text not null default 'Member',
  claimed_position    text,
  claim_status        text not null default 'none' check (claim_status in ('none', 'pending', 'approved', 'rejected', 'revoked')),
  verification_method text not null default 'member_join',
  office_hours        text not null default '',
  reviewed_by         uuid references public.users(id) on delete set null,
  reviewed_at         timestamptz,
  joined_at           timestamptz not null default timezone('utc', now()),
  updated_at          timestamptz not null default timezone('utc', now()),
  unique (club_id, user_id)
);

-- Atomic race-condition guard: no two approved members can ever occupy the same roster position
create unique index if not exists idx_club_members_unique_claimed_position
  on public.club_members (club_id, lower(claimed_position))
  where claimed_position is not null and claim_status = 'approved';

create index if not exists idx_club_members_club_role on public.club_members (club_id, role);
create index if not exists idx_club_members_user on public.club_members (user_id);

drop trigger if exists trg_club_members_updated_at on public.club_members;
create trigger trg_club_members_updated_at
  before update on public.club_members
  for each row execute function public.set_updated_at();

-- ── 4. CLUB_GROUPS (Custom Club Sub-Groups, e.g. "Marketing", "Events") ─────
create table if not exists public.club_groups (
  id          uuid primary key default gen_random_uuid(),
  club_id     text not null references public.clubs(id) on delete cascade,
  name        text not null,
  color       text not null default 'blue',
  description text not null default '',
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default timezone('utc', now()),
  updated_at  timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_club_groups_unique_name
  on public.club_groups (club_id, lower(name));

create index if not exists idx_club_groups_club on public.club_groups (club_id);

drop trigger if exists trg_club_groups_updated_at on public.club_groups;
create trigger trg_club_groups_updated_at
  before update on public.club_groups
  for each row execute function public.set_updated_at();

-- ── 5. GROUP_MEMBERS ────────────────────────────────────────────────────────
create table if not exists public.group_members (
  id        uuid primary key default gen_random_uuid(),
  group_id  uuid not null references public.club_groups(id) on delete cascade,
  club_id   text not null references public.clubs(id) on delete cascade,
  user_id   uuid not null references public.users(id) on delete cascade,
  added_by  uuid references public.users(id) on delete set null,
  added_at  timestamptz not null default timezone('utc', now()),
  unique (group_id, user_id)
);

create index if not exists idx_group_members_user_club on public.group_members (user_id, club_id);
create index if not exists idx_group_members_group on public.group_members (group_id);

-- ── 6. POLLS (Real-User Availability Polls + Leadership Targeting) ──────────
create table if not exists public.polls (
  id                uuid primary key default gen_random_uuid(),
  club_id           text references public.clubs(id) on delete cascade,
  title             text not null,
  description       text not null default '',
  dates             jsonb not null default '[]'::jsonb,
  start_hour        integer not null default 9 check (start_hour between 0 and 23),
  end_hour          integer not null default 20 check (end_hour between 1 and 24),
  slot_minutes      integer not null default 30 check (slot_minutes in (15, 30, 60)),
  timezone          text not null default 'America/Los_Angeles',
  location          text not null default 'TBD',
  visibility        text not null default 'club_members' check (visibility in ('public_link', 'club_members', 'board_only')),
  invited_user_ids  uuid[] not null default '{}',
  target_group_ids  uuid[] not null default '{}',
  booked_events     jsonb not null default '[]'::jsonb,
  archived          boolean not null default false,
  archived_at       timestamptz,
  created_by        uuid not null references public.users(id) on delete cascade,
  created_at        timestamptz not null default timezone('utc', now()),
  updated_at        timestamptz not null default timezone('utc', now())
);

alter table public.polls add column if not exists archived boolean not null default false;
alter table public.polls add column if not exists archived_at timestamptz;

create index if not exists idx_polls_club on public.polls (club_id);

drop trigger if exists trg_polls_updated_at on public.polls;
create trigger trg_polls_updated_at
  before update on public.polls
  for each row execute function public.set_updated_at();

-- ── 7. POLL_RESPONSES (Strictly Authenticated Users Only) ───────────────────
create table if not exists public.poll_responses (
  id          uuid primary key default gen_random_uuid(),
  poll_id     uuid not null references public.polls(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  timezone    text not null default 'America/Los_Angeles',
  free_slots  jsonb not null default '[]'::jsonb,
  busy_slots  jsonb not null default '[]'::jsonb,
  notes       text not null default '',
  updated_at  timestamptz not null default timezone('utc', now()),
  unique (poll_id, user_id)
);

create index if not exists idx_poll_responses_poll on public.poll_responses (poll_id);

-- ── 8. ANNOUNCEMENTS ────────────────────────────────────────────────────────
create table if not exists public.announcements (
  id               uuid primary key default gen_random_uuid(),
  club_id          text not null references public.clubs(id) on delete cascade,
  title            text not null,
  body             text not null default '',
  type             text not null default 'Update',
  visibility       text not null default 'members' check (visibility in ('public', 'members', 'group', 'board')),
  target_group_ids uuid[] not null default '{}',
  target_user_ids  uuid[] not null default '{}',
  permalink        text not null default '',
  author_id        uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default timezone('utc', now())
);

create index if not exists idx_announcements_club on public.announcements (club_id, visibility);

-- ── 9. TASKS (Two-Tier Monday.com-Style Club Task Board) ────────────────────
create table if not exists public.tasks (
  id                    uuid primary key default gen_random_uuid(),
  club_id               text not null references public.clubs(id) on delete cascade,
  section_title         text not null default 'General Club Tasks',
  section_color         text not null default 'blue',
  title                 text not null,
  notes                 text not null default '',
  visibility            text not null default 'members' check (visibility in ('members', 'board', 'personal')),
  audience              text not null default 'general' check (audience in ('general', 'targeted', 'board', 'personal')),
  status                text not null default 'not_started' check (status in ('not_started', 'working_on_it', 'in_review', 'stuck', 'done')),
  priority              text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  due_date              date,
  assigned_user_ids     uuid[] not null default '{}',
  assigned_group_ids    uuid[] not null default '{}',
  completed_by_user_ids uuid[] not null default '{}',
  position              integer not null default 0,
  created_by            uuid references public.users(id) on delete set null,
  created_at            timestamptz not null default timezone('utc', now()),
  updated_at            timestamptz not null default timezone('utc', now())
);

create index if not exists idx_tasks_club_vis on public.tasks (club_id, visibility, status);

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ============================================================================
-- SECURITY-DEFINER RBAC HELPERS & ATOMIC ROSTER CLAIM RPC
-- ============================================================================

create or replace function public.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.users
  where (auth.jwt()->>'sub') is not null
    and (id::text = (auth.jwt()->>'sub') or external_auth_id = (auth.jwt()->>'sub'))
  limit 1;
$$;

create or replace function public.is_club_member(p_club_id text, p_uid uuid default public.current_user_id())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.club_members
    where club_id = p_club_id and user_id = p_uid
  );
$$;

create or replace function public.is_club_board(p_club_id text, p_uid uuid default public.current_user_id())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.club_members
    where club_id = p_club_id
      and user_id = p_uid
      and role in ('board', 'president')
      and claim_status = 'approved'
  );
$$;

create or replace function public.is_in_any_club_group(p_group_ids uuid[], p_uid uuid default public.current_user_id())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where user_id = p_uid and group_id = any(coalesce(p_group_ids, '{}'::uuid[]))
  );
$$;

-- Atomic RPC for claiming an unclaimed roster position safely under concurrent load
create or replace function public.claim_roster_position(
  p_club_id text,
  p_position text,
  p_role_title text default 'Officer'
)
returns public.club_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.current_user_id();
  v_clean_pos text := trim(coalesce(p_position, ''));
  v_existing_board_count int;
  v_status text;
  v_role text;
  v_result public.club_members;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;
  if v_clean_pos = '' then
    raise exception 'claimed_position is required';
  end if;

  perform 1 from public.clubs where id = p_club_id for update;

  if exists (
    select 1 from public.club_members
    where club_id = p_club_id
      and lower(claimed_position) = lower(v_clean_pos)
      and claim_status = 'approved'
      and user_id <> v_uid
  ) then
    raise exception 'Position already claimed by another verified member' using errcode = '23505';
  end if;

  select count(*) into v_existing_board_count
  from public.club_members
  where club_id = p_club_id and role in ('board', 'president') and claim_status = 'approved' and user_id <> v_uid;

  v_status := case when v_existing_board_count = 0 then 'approved' else 'pending' end;
  v_role := case
    when v_status = 'approved' and p_role_title ~* '(president|captain|founder|director)' then 'president'
    when v_status = 'approved' then 'board'
    else 'member'
  end;

  insert into public.club_members (club_id, user_id, role, role_title, claimed_position, claim_status, verification_method)
  values (p_club_id, v_uid, v_role, coalesce(nullif(trim(p_role_title), ''), 'Officer'), v_clean_pos, v_status,
          case when v_status = 'approved' then 'first_board_claim' else 'pending_board_review' end)
  on conflict (club_id, user_id) do update
    set claimed_position = excluded.claimed_position,
        claim_status = excluded.claim_status,
        role = excluded.role,
        role_title = excluded.role_title,
        verification_method = excluded.verification_method
  returning * into v_result;

  return v_result;
end;
$$;

-- ============================================================================
-- STRICT ROW LEVEL SECURITY (RLS) POLICIES FOR ALL 9 TABLES
-- ============================================================================

alter table public.users enable row level security;
alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.club_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.polls enable row level security;
alter table public.poll_responses enable row level security;
alter table public.announcements enable row level security;
alter table public.tasks enable row level security;

-- 1. USERS: Authenticated users can view basic profiles of fellow members; update only self
drop policy if exists users_select_authenticated on public.users;
create policy users_select_authenticated on public.users
  for select to authenticated using (true);
drop policy if exists users_insert_self on public.users;
create policy users_insert_self on public.users
  for insert to authenticated
  with check (
    (auth.jwt()->>'sub') is not null
    and (id::text = (auth.jwt()->>'sub') or external_auth_id = (auth.jwt()->>'sub'))
  );
drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
  for update to authenticated using (id = public.current_user_id()) with check (id = public.current_user_id());

-- 2. CLUBS: Public directory read; authenticated create; board-only update/delete
drop policy if exists clubs_select_all on public.clubs;
create policy clubs_select_all on public.clubs
  for select using (true);
drop policy if exists clubs_insert_authenticated on public.clubs;
create policy clubs_insert_authenticated on public.clubs
  for insert to authenticated with check ((auth.jwt()->>'sub') is not null);
drop policy if exists clubs_update_board on public.clubs;
create policy clubs_update_board on public.clubs
  for update to authenticated using (public.is_club_board(id)) with check (public.is_club_board(id));
drop policy if exists clubs_delete_board on public.clubs;
create policy clubs_delete_board on public.clubs
  for delete to authenticated using (public.is_club_board(id));

-- 3. CLUB_MEMBERS: Club members see roster; users can join as 'member' or submit 'pending' claim; only Board approves/promotes
drop policy if exists club_members_select on public.club_members;
create policy club_members_select on public.club_members
  for select to authenticated using (user_id = public.current_user_id() or public.is_club_member(club_id));
drop policy if exists club_members_insert_self on public.club_members;
create policy club_members_insert_self on public.club_members
  for insert to authenticated
  with check (
    user_id = public.current_user_id()
    and role = 'member'
    and claim_status in ('none', 'pending')
  );
drop policy if exists club_members_update_board_or_self on public.club_members;
create policy club_members_update_board_or_self on public.club_members
  for update to authenticated
  using (public.is_club_board(club_id) or user_id = public.current_user_id())
  with check (
    public.is_club_board(club_id)
    or (user_id = public.current_user_id() and role = 'member' and claim_status in ('none', 'pending', 'revoked'))
  );
drop policy if exists club_members_delete_board_or_self on public.club_members;
create policy club_members_delete_board_or_self on public.club_members
  for delete to authenticated using (user_id = public.current_user_id() or public.is_club_board(club_id));

-- 4. CLUB_GROUPS: Visible to club members; strictly Board-managed CRUD
drop policy if exists club_groups_select_members on public.club_groups;
create policy club_groups_select_members on public.club_groups
  for select to authenticated using (public.is_club_member(club_id));
drop policy if exists club_groups_manage_board on public.club_groups;
create policy club_groups_manage_board on public.club_groups
  for all to authenticated using (public.is_club_board(club_id)) with check (public.is_club_board(club_id));

-- 5. GROUP_MEMBERS: Visible to club members; strictly Board-managed CRUD
drop policy if exists group_members_select_members on public.group_members;
create policy group_members_select_members on public.group_members
  for select to authenticated using (public.is_club_member(club_id));
drop policy if exists group_members_manage_board on public.group_members;
create policy group_members_manage_board on public.group_members
  for all to authenticated using (public.is_club_board(club_id)) with check (public.is_club_board(club_id));

-- 6. POLLS: Visibility enforced by poll tier; Board creates club polls
drop policy if exists polls_select_scoped on public.polls;
create policy polls_select_scoped on public.polls
  for select to authenticated
  using (
    created_by = public.current_user_id()
    or visibility = 'public_link'
    or public.current_user_id() = any(invited_user_ids)
    or public.is_in_any_club_group(target_group_ids)
    or (club_id is not null and visibility = 'club_members' and public.is_club_member(club_id))
    or (club_id is not null and visibility = 'board_only' and public.is_club_board(club_id))
  );
drop policy if exists polls_insert_board_or_personal on public.polls;
create policy polls_insert_board_or_personal on public.polls
  for insert to authenticated
  with check (
    created_by = public.current_user_id()
    and (club_id is null or public.is_club_board(club_id))
  );
drop policy if exists polls_update_creator_or_board on public.polls;
create policy polls_update_creator_or_board on public.polls
  for update to authenticated
  using (created_by = public.current_user_id() or (club_id is not null and public.is_club_board(club_id)))
  with check (created_by = public.current_user_id() or (club_id is not null and public.is_club_board(club_id)));
drop policy if exists polls_delete_creator_or_board on public.polls;
create policy polls_delete_creator_or_board on public.polls
  for delete to authenticated
  using (created_by = public.current_user_id() or (club_id is not null and public.is_club_board(club_id)));

-- 7. POLL_RESPONSES: Visible to poll participants; users can ONLY insert/update/delete their own response
drop policy if exists poll_responses_select on public.poll_responses;
create policy poll_responses_select on public.poll_responses
  for select to authenticated
  using (
    exists (select 1 from public.polls p where p.id = poll_id)
  );
drop policy if exists poll_responses_write_self on public.poll_responses;
create policy poll_responses_write_self on public.poll_responses
  for all to authenticated
  using (user_id = public.current_user_id())
  with check (user_id = public.current_user_id() and exists (select 1 from public.polls p where p.id = poll_id));

-- 8. ANNOUNCEMENTS: Scoped to targeted audience (public, members, group, or board); Board-only write
drop policy if exists announcements_select_targeted on public.announcements;
create policy announcements_select_targeted on public.announcements
  for select
  using (
    visibility = 'public'
    or (
      public.current_user_id() is not null
      and (
        public.is_club_board(club_id)
        or (visibility = 'members' and public.is_club_member(club_id))
        or (visibility = 'group' and (public.is_in_any_club_group(target_group_ids) or public.current_user_id() = any(target_user_ids)))
      )
    )
  );
drop policy if exists announcements_manage_board on public.announcements;
create policy announcements_manage_board on public.announcements
  for all to authenticated
  using (public.is_club_board(club_id))
  with check (public.is_club_board(club_id));

-- 9. TASKS: Two-tier visibility (Member View vs. Board View), Per-Server Personal To-Dos & scoped status updates
drop policy if exists tasks_select_two_tier on public.tasks;
create policy tasks_select_two_tier on public.tasks
  for select to authenticated
  using (
    (
      visibility = 'personal'
      and created_by = public.current_user_id()
      and public.is_club_member(club_id)
    )
    or (
      visibility <> 'personal'
      and (
        public.is_club_board(club_id)
        or (
          visibility = 'members'
          and public.is_club_member(club_id)
          and (
            audience = 'general'
            or public.current_user_id() = any(assigned_user_ids)
            or public.is_in_any_club_group(assigned_group_ids)
          )
        )
      )
    )
  );
drop policy if exists tasks_insert_board on public.tasks;
create policy tasks_insert_board on public.tasks
  for insert to authenticated
  with check (
    (
      visibility = 'personal'
      and audience = 'personal'
      and created_by = public.current_user_id()
      and public.is_club_member(club_id)
    )
    or (
      visibility <> 'personal'
      and public.is_club_board(club_id)
    )
  );
drop policy if exists tasks_update_board_or_assignee on public.tasks;
create policy tasks_update_board_or_assignee on public.tasks
  for update to authenticated
  using (
    (
      visibility = 'personal'
      and created_by = public.current_user_id()
      and public.is_club_member(club_id)
    )
    or (
      visibility <> 'personal'
      and (
        public.is_club_board(club_id)
        or (
          visibility = 'members'
          and public.is_club_member(club_id)
          and (
            audience = 'general'
            or public.current_user_id() = any(assigned_user_ids)
            or public.is_in_any_club_group(assigned_group_ids)
          )
        )
      )
    )
  )
  with check (
    (
      visibility = 'personal'
      and audience = 'personal'
      and created_by = public.current_user_id()
      and public.is_club_member(club_id)
    )
    or (
      visibility <> 'personal'
      and (
        public.is_club_board(club_id)
        or (
          visibility = 'members'
          and public.is_club_member(club_id)
        )
      )
    )
  );
drop policy if exists tasks_delete_board on public.tasks;
create policy tasks_delete_board on public.tasks
  for delete to authenticated
  using (
    (
      visibility = 'personal'
      and created_by = public.current_user_id()
      and public.is_club_member(club_id)
    )
    or (
      visibility <> 'personal'
      and public.is_club_board(club_id)
    )
  );
