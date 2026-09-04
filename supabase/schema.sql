-- Multi-participant rooms (Phases 1-2)
-- Run in Supabase SQL Editor. pgcrypto is already enabled on Supabase.

create table if not exists rooms (
  id text primary key,
  status text not null default 'open',
  host_participant_id uuid,
  max_participants int not null default 10,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours')
);

create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references rooms(id) on delete cascade,
  display_name text not null,
  source_language text not null,
  target_language text not null,
  is_online boolean not null default true,
  joined_at timestamptz not null default now()
);

create table if not exists utterances (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references rooms(id) on delete cascade,
  from_participant_id uuid not null references participants(id) on delete cascade,
  source_language text not null,
  source_text text not null,
  target_language text not null,
  translated_text text,
  failed boolean not null default false,
  client_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_participants_room on participants(room_id);
create index if not exists idx_utterances_room_target
  on utterances(room_id, target_language, created_at);

alter table rooms enable row level security;
alter table participants enable row level security;
alter table utterances enable row level security;
