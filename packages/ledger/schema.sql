-- Torna — card issuer ledger (off-chain)
-- Owner: C (packages/ledger)
--
-- Apply:  psql "$DATABASE_URL" -f packages/ledger/schema.sql
--
-- This script DROPS and recreates every table. Run it to reset the ledger to
-- an empty state before seeding (PRD 15, step 2). Never run it against data
-- you want to keep.
--
-- Conventions
--   * Amounts are 2-decimal card units (1000.00). Conversion to 6-decimal
--     on-chain integers happens ONLY in the adapter.
--   * position_state spelling matches the contract enum and the snapshot
--     schema exactly (PRD 10.7).
--   * refund_key / acquirer hashes are written by the adapter's hash module.
--     Postgres has no keccak256, so the database never computes them.

begin;

drop function if exists public.credit_ledger(text, numeric, text);
drop table if exists public.ledger_credits cascade;
drop table if exists public.refunds        cascade;
drop table if exists public.transactions   cascade;
drop table if exists public.cardholders    cascade;
drop table if exists public.issuers        cascade;
drop table if exists public.acquirers      cascade;

-- ---------------------------------------------------------------------------
-- acquirers — upstream settlement parties. display_name never goes on chain,
-- so the label dump reads it from here.
-- ---------------------------------------------------------------------------
create table public.acquirers (
  acquirer_id   text primary key,                 -- 'ACQ-α'
  display_name  text not null                     -- 'Acquirer α (Alpha)'
);

-- ---------------------------------------------------------------------------
-- issuers — card issuers. region never goes on chain (label dump source).
-- ---------------------------------------------------------------------------
create table public.issuers (
  key           text primary key,                 -- 'HYBRID'
  name          text not null,                    -- 'HYBRID Travel Card'
  region        text not null,                    -- 'North America / Europe'
  acquirer_id   text not null references public.acquirers (acquirer_id),
  wallet_index  smallint unique
                check (wallet_index between 3 and 7),  -- mnemonic index (PRD 14)
  address       text unique
                check (address ~ '^0x[0-9a-fA-F]{40}$')  -- filled after derivation
);

-- ---------------------------------------------------------------------------
-- cardholders — end users. balance is what the user app shows.
-- ---------------------------------------------------------------------------
create table public.cardholders (
  id            bigint generated always as identity primary key,
  issuer_key    text not null references public.issuers (key),
  display_name  text not null,
  balance       numeric(14, 2) not null default 0 check (balance >= 0),
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- transactions — purchase / cancellation history.
-- ---------------------------------------------------------------------------
create table public.transactions (
  id            bigint generated always as identity primary key,
  cardholder_id bigint not null references public.cardholders (id),
  kind          text not null check (kind in ('purchase', 'cancel')),
  merchant      text not null,
  amount        numeric(14, 2) not null check (amount > 0),
  occurred_at   timestamptz not null
);

create index transactions_cardholder_idx on public.transactions (cardholder_id);

-- ---------------------------------------------------------------------------
-- refunds — the core table. One row per confirmed refund (PRD 10.6 ①).
--   status          card-side confirmation ('confirmed' in PRD 10.6)
--   position_state  mirror of the on-chain position (PRD 10.7), null until
--                   the adapter submits it
-- ---------------------------------------------------------------------------
create table public.refunds (
  refund_id       text primary key,               -- 'REF-2026-001'
  refund_key      text unique
                  check (refund_key ~ '^0x[0-9a-f]{64}$'),  -- keccak256(refund_id)
  issuer_key      text not null references public.issuers (key),
  acquirer_id     text not null references public.acquirers (acquirer_id),
  cardholder_id   bigint references public.cardholders (id),
  cancel_tx_id    bigint references public.transactions (id),
  amount          numeric(14, 2) not null check (amount > 0),
  confirmed_at    timestamptz not null,
  status          text not null default 'confirmed'
                  check (status in ('pending', 'confirmed')),
  position_state  text
                  check (position_state in (
                    'Registered', 'Advanced', 'Repaid', 'Overdue',
                    'Review', 'CoveredLoss', 'CapHeld', 'RecoveryRecorded'
                  )),
  timepoint       text                            -- scenario that uses this row
                  check (timepoint in (
                    't0', 't1', 't2', 't3', 't3b', 't4',
                    't5', 't6', 't7', 't8', 't9', 't9b'
                  )),
  advance_tx_hash text
                  check (advance_tx_hash ~ '^0x[0-9a-f]{64}$'),
  created_at      timestamptz not null default now()
);

create index refunds_issuer_idx    on public.refunds (issuer_key);
create index refunds_timepoint_idx on public.refunds (timepoint);

-- ---------------------------------------------------------------------------
-- ledger_credits — balance restorations. UNIQUE(refund_key) is the proof
-- that one refund is credited at most once, even if the chain succeeds and
-- the DB write is retried (timepoint t7).
-- ---------------------------------------------------------------------------
create table public.ledger_credits (
  id             bigint generated always as identity primary key,
  refund_key     text not null unique
                 references public.refunds (refund_key),
  cardholder_id  bigint not null references public.cardholders (id),
  amount         numeric(14, 2) not null check (amount > 0),
  chain_tx_hash  text check (chain_tx_hash ~ '^0x[0-9a-f]{64}$'),
  credited_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- credit_ledger — idempotent balance restoration.
-- Returns true if this call credited the balance, false if the refund_key
-- was already credited. Insert and balance update happen in one statement
-- scope, so a retry can never double-credit.
-- ---------------------------------------------------------------------------
create function public.credit_ledger(
  p_refund_key    text,
  p_amount        numeric,
  p_chain_tx_hash text default null
) returns boolean
language plpgsql
as $$
declare
  v_cardholder bigint;
  v_inserted   bigint;
begin
  select cardholder_id into v_cardholder
    from public.refunds
   where refund_key = p_refund_key;

  if v_cardholder is null then
    raise exception 'credit_ledger: no refund with cardholder for key %', p_refund_key;
  end if;

  insert into public.ledger_credits (refund_key, cardholder_id, amount, chain_tx_hash)
  values (p_refund_key, v_cardholder, p_amount, p_chain_tx_hash)
  on conflict (refund_key) do nothing
  returning id into v_inserted;

  if v_inserted is null then
    return false;                 -- already credited: no-op
  end if;

  update public.cardholders
     set balance = balance + p_amount
   where id = v_cardholder;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access. New Supabase projects do not expose tables to the Data API by
-- default. Scripts use service_role (bypasses RLS). RLS stays on with no
-- policies, so the public anon key can read nothing.
-- ---------------------------------------------------------------------------
alter table public.acquirers      enable row level security;
alter table public.issuers        enable row level security;
alter table public.cardholders    enable row level security;
alter table public.transactions   enable row level security;
alter table public.refunds        enable row level security;
alter table public.ledger_credits enable row level security;

grant select, insert, update, delete
  on public.acquirers, public.issuers, public.cardholders,
     public.transactions, public.refunds, public.ledger_credits
  to service_role;
grant usage, select on all sequences in schema public to service_role;
revoke execute on function public.credit_ledger(text, numeric, text) from public, anon, authenticated;
grant  execute on function public.credit_ledger(text, numeric, text) to service_role;

commit;
