-- Early V2 normalized storage. The V1 table remains untouched and read-only.
create extension if not exists pgcrypto;

create table if not exists public.proof_sessions_v2 (
  session_id text primary key,
  privy_user_id text not null,
  wallet_address text not null,
  platform text not null check (platform in ('x', 'youtube')),
  subject_id text not null,
  subject_url text not null,
  provider_configuration jsonb not null,
  provider_hash text not null,
  session_nullifier text not null unique,
  request_url text not null,
  status_url text,
  status text not null default 'pending'
    check (status in ('pending', 'verifying', 'verified', 'failed', 'finalized')),
  proof_ciphertext jsonb,
  raw_proof_expires_at timestamptz,
  verified_discovery jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists proof_sessions_v2_owner_idx
  on public.proof_sessions_v2 (privy_user_id, created_at desc);
create index if not exists proof_sessions_v2_retention_idx
  on public.proof_sessions_v2 (raw_proof_expires_at)
  where proof_ciphertext is not null;

create table if not exists public.chain_receipts_v2 (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references public.proof_sessions_v2(session_id),
  privy_user_id text not null,
  chain_id bigint not null,
  contract_address text not null,
  transaction_hash text not null unique,
  commitment text not null unique,
  status text not null check (status in ('submitted', 'confirmed', 'failed')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create table if not exists public.vault_identities_v2 (
  privy_user_id text primary key,
  vault_id text not null unique,
  owner_binding text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.confidential_inputs_v2 (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references public.proof_sessions_v2(session_id),
  privy_user_id text not null,
  vault_id text not null,
  owner_binding text not null,
  proof_commitment text not null unique,
  subject_hash text not null,
  ciphertext_hash text not null,
  nonce numeric not null,
  expiry timestamptz not null,
  zama_transaction_hash text unique,
  status text not null check (status in ('attested', 'submitted', 'confirmed', 'failed')),
  created_at timestamptz not null default now()
);

create table if not exists public.campaigns_v2 (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  creator_privy_user_id text not null,
  creator_wallet text not null,
  subject_id text not null,
  subject_url text not null,
  subject_hash text not null,
  platform text not null check (platform in ('x', 'youtube')),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  maximum_discovery_minutes integer not null check (maximum_discovery_minutes >= 0),
  minimum_interactions integer not null check (minimum_interactions > 0),
  base_campaign_id numeric,
  base_transaction_hash text unique,
  zama_campaign_id numeric,
  zama_transaction_hash text unique,
  status text not null default 'draft' check (status in ('draft', 'active', 'closed')),
  created_at timestamptz not null default now()
);

-- Safe upgrade path for projects that created the V2 campaign table before
-- creator-facing metadata and transaction reconciliation were introduced.
alter table public.campaigns_v2
  add column if not exists name text,
  add column if not exists subject_id text,
  add column if not exists subject_url text,
  add column if not exists base_transaction_hash text,
  add column if not exists zama_transaction_hash text;

create unique index if not exists campaigns_v2_base_transaction_uq
  on public.campaigns_v2 (base_transaction_hash)
  where base_transaction_hash is not null;
create unique index if not exists campaigns_v2_zama_transaction_uq
  on public.campaigns_v2 (zama_transaction_hash)
  where zama_transaction_hash is not null;

create table if not exists public.evaluations_v2 (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns_v2(id),
  privy_user_id text not null,
  vault_id text not null,
  evaluation_id text not null unique,
  zama_transaction_hash text unique,
  public_eligible boolean,
  authorization_nullifier text unique,
  base_claim_transaction_hash text unique,
  status text not null
    check (status in ('requested', 'evaluated', 'authorized', 'claimed', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.proof_sessions_v2 enable row level security;
alter table public.chain_receipts_v2 enable row level security;
alter table public.vault_identities_v2 enable row level security;
alter table public.confidential_inputs_v2 enable row level security;
alter table public.campaigns_v2 enable row level security;
alter table public.evaluations_v2 enable row level security;

-- The application backend uses the service role and performs Privy ownership checks.
-- No anonymous or authenticated PostgREST policies are intentionally created.
