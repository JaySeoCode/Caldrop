-- ---------------------------------------------------------------------------
-- CalDrop schema
-- Run in the Supabase SQL editor (or `supabase db push`).
--
-- Security model:
--   * Every table has RLS enabled with NO permissive policy.
--   * The app talks to Postgres exclusively through the service role key from
--     server-side code, after authenticating the user itself. RLS therefore
--     acts as a hard backstop: a leaked anon key grants zero data access.
--   * Google refresh tokens are AES-256-GCM encrypted in the application layer
--     before they ever reach the database (see src/lib/util/crypto.ts).
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

-- --------------------------------------------------------------------------
-- users
-- --------------------------------------------------------------------------
create table if not exists public.users (
  id           uuid primary key default gen_random_uuid(),
  google_sub   text        not null unique,
  email        text        not null unique,
  name         text,
  picture      text,
  timezone     text        not null default 'Asia/Seoul',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- google_accounts : one row per user, holds the encrypted refresh token
-- --------------------------------------------------------------------------
create table if not exists public.google_accounts (
  user_id                 uuid primary key references public.users (id) on delete cascade,
  encrypted_refresh_token text        not null,
  scopes                  text[]      not null default '{}',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- calendar_requests : one row per analysis (audit trail + confirm source of truth)
-- --------------------------------------------------------------------------
do $$ begin
  create type public.input_type as enum ('text', 'image');
exception when duplicate_object then null; end $$;
-- Added later: PDF uploads (a syllabus, an itinerary).
alter type public.input_type add value if not exists 'pdf';

do $$ begin
  create type public.request_status as enum ('analyzing', 'previewed', 'confirmed', 'discarded', 'failed');
exception when duplicate_object then null; end $$;

create table if not exists public.calendar_requests (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users (id) on delete cascade,
  input_type     public.input_type   not null,
  original_text  text,
  image_url      text,
  -- Nothing about the image bytes is stored by default; only a sha-256 digest
  -- so repeated uploads can be correlated in the audit trail.
  image_sha256   text,
  ai_result      jsonb,
  -- Candidate events shown to the model, so confirm can verify that the
  -- targetEventId was actually part of the retrieved (user-owned) candidate set.
  candidate_event_ids text[] not null default '{}',
  model          text,
  status         public.request_status not null default 'analyzing',
  error          text,
  created_at     timestamptz not null default now()
);

create index if not exists calendar_requests_user_created_idx
  on public.calendar_requests (user_id, created_at desc);

-- --------------------------------------------------------------------------
-- calendar_actions : one row per executed (or attempted) calendar mutation
-- --------------------------------------------------------------------------
do $$ begin
  create type public.calendar_action_kind as enum
    ('CREATE', 'UPDATE', 'DELETE', 'NO_ACTION', 'NEED_CLARIFICATION');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.action_status as enum ('pending', 'succeeded', 'failed');
exception when duplicate_object then null; end $$;

create table if not exists public.calendar_actions (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null references public.calendar_requests (id) on delete cascade,
  user_id         uuid not null references public.users (id) on delete cascade,
  action          public.calendar_action_kind not null,
  -- Position inside a multi-event proposal (CREATE_MANY); 0 for single writes.
  event_index     integer not null default 0,
  google_event_id text,
  payload         jsonb not null default '{}'::jsonb,
  status          public.action_status not null default 'pending',
  error           text,
  created_at      timestamptz not null default now()
);

-- Added later, for tables created before CREATE_MANY existed.
alter table public.calendar_actions
  add column if not exists event_index integer not null default 0;
-- Set when the user takes an auto-added event back from the notification.
alter table public.calendar_actions
  add column if not exists undone_at timestamptz;

create index if not exists calendar_actions_user_created_idx
  on public.calendar_actions (user_id, created_at desc);
-- One row per (request, event): still single-use per event, but a proposal may
-- now write several events under one request.
drop index if exists public.calendar_actions_request_unique;
create unique index if not exists calendar_actions_request_event_unique
  on public.calendar_actions (request_id, event_index);

-- --------------------------------------------------------------------------
-- push_subscriptions : one row per browser that opted into notifications
-- --------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  user_id     uuid not null references public.users (id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

-- --------------------------------------------------------------------------
-- updated_at triggers
-- --------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists users_touch_updated_at on public.users;
create trigger users_touch_updated_at
  before update on public.users
  for each row execute function public.touch_updated_at();

drop trigger if exists google_accounts_touch_updated_at on public.google_accounts;
create trigger google_accounts_touch_updated_at
  before update on public.google_accounts
  for each row execute function public.touch_updated_at();

-- --------------------------------------------------------------------------
-- Row level security: deny-by-default for anon/authenticated roles.
-- The service role used by the server bypasses RLS.
-- --------------------------------------------------------------------------
alter table public.users             enable row level security;
alter table public.google_accounts   enable row level security;
alter table public.calendar_requests enable row level security;
alter table public.calendar_actions  enable row level security;

revoke all on public.users             from anon, authenticated;
revoke all on public.google_accounts   from anon, authenticated;
revoke all on public.calendar_requests from anon, authenticated;
revoke all on public.calendar_actions  from anon, authenticated;
