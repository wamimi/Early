create table if not exists public.reclaim_proof_sessions (
  session_id text primary key,
  tweet_id text not null,
  tweet_url text not null,
  request_url text not null,
  status_url text,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  proof_payload jsonb,
  extracted_parameters jsonb,
  proof_artifact jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.reclaim_proof_sessions
  add column if not exists proof_artifact jsonb;

create index if not exists reclaim_proof_sessions_status_idx
  on public.reclaim_proof_sessions (status);

create index if not exists reclaim_proof_sessions_created_at_idx
  on public.reclaim_proof_sessions (created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reclaim_proof_sessions_updated_at
  on public.reclaim_proof_sessions;

create trigger reclaim_proof_sessions_updated_at
before update on public.reclaim_proof_sessions
for each row
execute function public.set_updated_at();

alter table public.reclaim_proof_sessions enable row level security;
