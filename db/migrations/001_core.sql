-- AL MOVE: núcleo PostgreSQL. Não contém dados de produção.
-- Aplicar apenas através do histórico de migrações do projeto PostgreSQL.

create extension if not exists citext;
create extension if not exists pgcrypto;

create table app_users (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text not null unique,
  email citext not null unique,
  created_at timestamptz not null default now(),
  disabled_at timestamptz
);

create table user_roles (
  user_id uuid not null references app_users(id) on delete cascade,
  role text not null check (role in ('client', 'coach', 'admin')),
  granted_at timestamptz not null default now(),
  granted_by uuid references app_users(id),
  primary key (user_id, role)
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid unique references app_users(id) on delete set null,
  legacy_crm_id text unique,
  full_name text not null,
  phone text,
  birth_date date,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table coaches (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid not null unique references app_users(id) on delete restrict,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table coach_clients (
  coach_id uuid not null references coaches(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'ended')),
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  primary key (coach_id, client_id)
);

create table training_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete restrict,
  coach_id uuid not null references coaches(id) on delete restrict,
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  active_from date,
  active_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table plan_exercises (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references training_plans(id) on delete cascade,
  position smallint not null check (position > 0),
  exercise_key text not null,
  exercise_name text not null,
  target_sets smallint not null check (target_sets between 1 and 20),
  repetitions_min smallint check (repetitions_min between 0 and 100),
  repetitions_max smallint check (repetitions_max between 0 and 100),
  target_rir smallint check (target_rir between 0 and 10),
  rest_seconds integer not null default 90 check (rest_seconds between 0 and 3600),
  notes text,
  unique (plan_id, position),
  check (repetitions_max is null or repetitions_min is null or repetitions_max >= repetitions_min)
);

create table workout_sessions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete restrict,
  plan_id uuid references training_plans(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status <> 'completed') or completed_at is not null)
);

-- Append-only: corrigir uma série cria outro evento e preserva o original.
create table workout_set_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  session_id uuid not null references workout_sessions(id) on delete restrict,
  plan_exercise_id uuid not null references plan_exercises(id) on delete restrict,
  set_number smallint not null check (set_number between 1 and 20),
  event_type text not null default 'recorded' check (event_type in ('recorded', 'corrected', 'voided')),
  replaces_event_id uuid references workout_set_events(id) on delete restrict,
  repetitions smallint check (repetitions between 0 and 100),
  load_kg numeric(6, 2) check (load_kg between 0 and 2000),
  rir smallint check (rir between 0 and 10),
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null references app_users(id) on delete restrict,
  check ((event_type = 'corrected') = (replaces_event_id is not null))
);

create index coach_clients_client_active_idx on coach_clients (client_id) where status = 'active';
create index training_plans_client_active_idx on training_plans (client_id) where status = 'active';
create index workout_sessions_client_started_idx on workout_sessions (client_id, started_at desc);
create index workout_set_events_session_idx on workout_set_events (session_id, recorded_at);

create table audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references app_users(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  request_id uuid unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_client_created_idx on audit_log (client_id, created_at desc);

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger clients_updated_at before update on clients
for each row execute function set_updated_at();
create trigger training_plans_updated_at before update on training_plans
for each row execute function set_updated_at();

-- Deny direct browser/Data API access by default. Vercel is the only caller.
alter table app_users enable row level security;
alter table user_roles enable row level security;
alter table clients enable row level security;
alter table coaches enable row level security;
alter table coach_clients enable row level security;
alter table training_plans enable row level security;
alter table plan_exercises enable row level security;
alter table workout_sessions enable row level security;
alter table workout_set_events enable row level security;
alter table audit_log enable row level security;
