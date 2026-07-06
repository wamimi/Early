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
  stellar_wallet_address text,
  stellar_network text,
  stellar_contract_id text,
  stellar_receipt_tx_hash text,
  stellar_receipt_status text check (
    stellar_receipt_status is null
    or stellar_receipt_status in ('prepared', 'pending', 'published', 'failed')
  ),
  stellar_receipt_created_at timestamptz,
  stellar_verifier_contract_id text,
  stellar_verifier_tx_hash text,
  stellar_verifier_status text check (
    stellar_verifier_status is null
    or stellar_verifier_status in ('prepared', 'pending', 'verified', 'failed')
  ),
  stellar_verifier_created_at timestamptz,
  stellar_verifier_error_message text,
  zama_wallet_address text,
  zama_network text,
  zama_contract_address text,
  zama_tx_hash text,
  zama_status text check (
    zama_status is null
    or zama_status in ('prepared', 'pending', 'sealed', 'failed')
  ),
  zama_encrypted_timestamp_handle text,
  zama_encrypted_early_delta_handle text,
  zama_tier_handle text,
  zama_public_tier integer,
  zama_public_tier_label text,
  zama_campaign_window_minutes integer,
  zama_eligibility_handle text,
  zama_public_eligible boolean,
  zama_created_at timestamptz,
  zama_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.reclaim_proof_sessions
  add column if not exists proof_artifact jsonb;

alter table public.reclaim_proof_sessions
  add column if not exists stellar_wallet_address text,
  add column if not exists stellar_network text,
  add column if not exists stellar_contract_id text,
  add column if not exists stellar_receipt_tx_hash text,
  add column if not exists stellar_receipt_status text,
  add column if not exists stellar_receipt_created_at timestamptz,
  add column if not exists stellar_verifier_contract_id text,
  add column if not exists stellar_verifier_tx_hash text,
  add column if not exists stellar_verifier_status text,
  add column if not exists stellar_verifier_created_at timestamptz,
  add column if not exists stellar_verifier_error_message text,
  add column if not exists zama_wallet_address text,
  add column if not exists zama_network text,
  add column if not exists zama_contract_address text,
  add column if not exists zama_tx_hash text,
  add column if not exists zama_status text,
  add column if not exists zama_encrypted_timestamp_handle text,
  add column if not exists zama_encrypted_early_delta_handle text,
  add column if not exists zama_tier_handle text,
  add column if not exists zama_public_tier integer,
  add column if not exists zama_public_tier_label text,
  add column if not exists zama_campaign_window_minutes integer,
  add column if not exists zama_eligibility_handle text,
  add column if not exists zama_public_eligible boolean,
  add column if not exists zama_created_at timestamptz,
  add column if not exists zama_error_message text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reclaim_proof_sessions_stellar_verifier_status_check'
  ) then
    alter table public.reclaim_proof_sessions
      add constraint reclaim_proof_sessions_stellar_verifier_status_check
      check (
        stellar_verifier_status is null
        or stellar_verifier_status in ('prepared', 'pending', 'verified', 'failed')
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reclaim_proof_sessions_zama_status_check'
  ) then
    alter table public.reclaim_proof_sessions
      add constraint reclaim_proof_sessions_zama_status_check
      check (
        zama_status is null
        or zama_status in ('prepared', 'pending', 'sealed', 'failed')
      );
  end if;
end;
$$;

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
