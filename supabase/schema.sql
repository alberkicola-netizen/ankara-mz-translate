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

-- Sessões a dois: o telemóvel e a Vercel leem/escrevem aqui (sem túnel do PC).
create table if not exists pair_sessions (
  code text primary key,
  status text not null default 'waiting',
  a_token text not null,
  a_lang text not null,
  b_token text,
  b_lang text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table pair_sessions enable row level security;

drop policy if exists pair_sessions_read on pair_sessions;
drop policy if exists pair_sessions_insert on pair_sessions;
drop policy if exists pair_sessions_update on pair_sessions;

create policy pair_sessions_read on pair_sessions
  for select using (expires_at > now());
create policy pair_sessions_insert on pair_sessions
  for insert with check (expires_at > now());
create policy pair_sessions_update on pair_sessions
  for update using (expires_at > now());

-- Leitura/criação pública das sessões a dois (sem texto clínico).
drop policy if exists rooms_public_read on rooms;
create policy rooms_public_read on rooms for select using (true);
drop policy if exists rooms_public_insert on rooms;
create policy rooms_public_insert on rooms for insert with check (max_participants <= 2);
drop policy if exists participants_public_read on participants;
create policy participants_public_read on participants for select using (true);
drop policy if exists participants_public_insert on participants;
create policy participants_public_insert on participants for insert with check (true);
