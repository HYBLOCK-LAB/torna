-- Torna — ledger seed (pre-run state)
-- Owner: C (packages/ledger)
--
-- Apply after schema.sql:
--   psql "$DATABASE_URL" -f packages/ledger/schema.sql
--   psql "$DATABASE_URL" -f packages/ledger/seed/seed.sql
--
-- Re-runnable: it empties every table first. Output is deterministic
-- (no random()), so every run produces the same rows.
--
-- This is the card issuer ledger BEFORE the scenario run (PRD 15, step 2):
-- every refund is 'confirmed' and has no on-chain position yet
-- (position_state and refund_key stay null until the adapter fills them).
--
-- Refund ids REF-2026-001 .. 378 are each used exactly once.
-- Scenario ids follow the reference bundle (shared/snapshots/sample,
-- shared/labels/sample.json, shared/narrative.ts):
--
--   t0   001               HYBRID / ACQ-α   cardholder refund experience
--   t1   021               HYBRID / ACQ-α   last of the 365, overdue -> Review (t2: CoveredLoss)
--   t1   364 others        HYBRID / AURA    one year of normal operation
--   t3   031 032 033 034   AURA   / ACQ-β   correlated loss
--   t4   170 171 172 173   HYBRID / ACQ-α   LP withdrawal
--   t5   014               HYBRID / ACQ-α   late but repaid
--
-- 021, 031..034 and 014 carry maturity_override_seconds = 120: their maturity
-- has to pass during the run (2026-09-23 team decision).
--   t8   045               HYBRID / ACQ-α   signed for another chain -> rejected
--   t9   210               NOVA     / ACQ-γ
--   t9   211               MERIDIAN / ACQ-δ
--
-- Not seeded: REF-UNKNOWN-99 (t8, signature from an unregistered issuer).
-- It is a forged request, not a record in the issuer's ledger.

begin;

truncate public.ledger_credits, public.refunds, public.transactions,
         public.cardholders, public.issuers, public.acquirers
  restart identity cascade;

-- ---------------------------------------------------------------------------
-- Acquirers and issuers (PRD 7, shared/labels/sample.json)
-- ---------------------------------------------------------------------------
insert into public.acquirers (acquirer_id, display_name) values
  ('ACQ-α', 'Acquirer α (Alpha)'),
  ('ACQ-β', 'Acquirer β (Beta)'),
  ('ACQ-γ', 'Acquirer γ (Gamma)'),
  ('ACQ-δ', 'Acquirer δ (Delta)'),
  ('ACQ-ε', 'Acquirer ε (Epsilon)');

insert into public.issuers (key, name, region, acquirer_id) values
  ('HYBRID',   'HYBRID Travel Card',   'North America / Europe', 'ACQ-α'),
  ('AURA',     'AURA Travel Card',     'Asia',                   'ACQ-β'),
  ('NOVA',     'NOVA Travel Card',     'Middle East / Africa',   'ACQ-γ'),
  ('MERIDIAN', 'MERIDIAN Travel Card', 'South America',          'ACQ-δ'),
  ('KITE',     'KITE Travel Card',     'Oceania',                'ACQ-ε');

-- ---------------------------------------------------------------------------
-- Cardholders. The demo cardholder starts at 300.00 so the t0 refund of
-- 1,000 restores the balance to 1,300.00 (PRD 6).
-- ---------------------------------------------------------------------------
insert into public.cardholders (issuer_id, display_name, balance)
select 'HYBRID', 'Demo Cardholder', 300.00;

insert into public.cardholders (issuer_id, display_name, balance)
select issuer, format('%s Cardholder %s', issuer, lpad(i::text, 2, '0')), 500.00
from (values ('HYBRID', 10), ('AURA', 6), ('NOVA', 2), ('MERIDIAN', 2), ('KITE', 2)) as t(issuer, n),
     generate_series(1, t.n) as i;

-- ---------------------------------------------------------------------------
-- Refunds
-- ---------------------------------------------------------------------------
create temporary table seed_refunds (
  n           int primary key,
  issuer_id   text not null,
  timepoint   text not null,
  confirmed_at timestamptz not null,
  maturity_override_seconds int
) on commit drop;

-- Scenario refunds (fixed by the reference bundle)
-- maturity_override_seconds = 120 for the six refunds whose maturity must pass
-- during the run: 021 (t1 review -> t2 covered loss), 031..034 (t3 correlated
-- loss), 014 (t5 late repayment). The runner waits 2 minutes before those
-- timepoints instead of an admin forcing the state.
insert into seed_refunds (n, issuer_id, timepoint, confirmed_at, maturity_override_seconds) values
  (  1, 'HYBRID',   't0', '2026-09-14T10:22:00Z', null),   -- PROJECT_SPEC 10.6
  ( 21, 'HYBRID',   't1', '2026-09-13T10:00:00Z', 120),    -- last day of the year
  ( 31, 'AURA',     't3', '2026-09-15T09:10:00Z', 120),
  ( 32, 'AURA',     't3', '2026-09-15T09:20:00Z', 120),
  ( 33, 'AURA',     't3', '2026-09-15T09:30:00Z', 120),
  ( 34, 'AURA',     't3', '2026-09-15T09:40:00Z', 120),
  (170, 'HYBRID',   't4', '2026-09-16T11:00:00Z', null),
  (171, 'HYBRID',   't4', '2026-09-16T11:10:00Z', null),
  (172, 'HYBRID',   't4', '2026-09-16T11:20:00Z', null),
  (173, 'HYBRID',   't4', '2026-09-16T11:30:00Z', null),
  ( 14, 'HYBRID',   't5', '2026-09-17T13:00:00Z', 120),
  ( 45, 'HYBRID',   't8', '2026-09-18T15:00:00Z', null),
  (210, 'NOVA',     't9', '2026-09-19T08:00:00Z', null),
  (211, 'MERIDIAN', 't9', '2026-09-19T08:30:00Z', null);

-- One year of normal operation: 364 closed refunds, one per day from
-- 2025-09-14 (the 365th is REF-2026-021 above). Numbers 002..378 that are
-- not scenario ids, alternating HYBRID (odd) / AURA (even).
insert into seed_refunds (n, issuer_id, timepoint, confirmed_at)
select n,
       case when n % 2 = 1 then 'HYBRID' else 'AURA' end,
       't1',
       timestamptz '2025-09-14T09:00:00Z'
         + make_interval(days  => (row_number() over (order by n))::int - 1,
                         mins  => (n * 37) % 480)
from generate_series(2, 378) as n
where n not in (select n from seed_refunds);

insert into public.refunds
  (refund_id, issuer_id, acquirer_id, cardholder_id, amount, confirmed_at, status, timepoint,
   maturity_override_seconds)
select format('REF-2026-%s', lpad(s.n::text, 3, '0')),
       s.issuer_id,
       i.acquirer_id,
       case when s.n = 1 then
         (select id from public.cardholders where display_name = 'Demo Cardholder')
       else
         (select c.id from public.cardholders c
           where c.issuer_id = s.issuer_id and c.display_name <> 'Demo Cardholder'
           order by c.id
           offset (s.n % (select count(*) from public.cardholders c2
                           where c2.issuer_id = s.issuer_id
                             and c2.display_name <> 'Demo Cardholder'))
           limit 1)
       end,
       1000.00,
       s.confirmed_at,
       'confirmed',
       s.timepoint,
       s.maturity_override_seconds
from seed_refunds s
join public.issuers i on i.key = s.issuer_id
order by s.n;

-- ---------------------------------------------------------------------------
-- Transactions: a purchase three days before, a cancellation one hour
-- before the refund is confirmed. The refund points at its cancellation.
-- ---------------------------------------------------------------------------
do $$
declare
  r         record;
  v_merchant text;
  v_cancel  bigint;
  merchants text[] := array[
    'Harborline Hotel', 'Northwind Suites', 'Blue Lagoon Resort', 'Skyway Airlines',
    'Cedar Lodge', 'Metro Rail Pass', 'Sunset Inn', 'Atlas Car Rental'
  ];
begin
  for r in select refund_id, cardholder_id, amount, confirmed_at,
                  substring(refund_id from 10)::int as n
             from public.refunds order by refund_id
  loop
    v_merchant := merchants[1 + (r.n % array_length(merchants, 1))];
    if r.n = 1 then v_merchant := 'Harborline Hotel'; end if;   -- t0 hotel booking

    insert into public.transactions (cardholder_id, kind, merchant, amount, occurred_at)
    values (r.cardholder_id, 'purchase', v_merchant, r.amount, r.confirmed_at - interval '3 days');

    insert into public.transactions (cardholder_id, kind, merchant, amount, occurred_at)
    values (r.cardholder_id, 'cancel', v_merchant, r.amount, r.confirmed_at - interval '1 hour')
    returning id into v_cancel;

    update public.refunds set cancel_tx_id = v_cancel where refund_id = r.refund_id;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Self-check. Aborts the whole seed if the counts are off.
-- ---------------------------------------------------------------------------
do $$
declare
  v int;
begin
  select count(*) into v from public.refunds;
  if v <> 378 then raise exception 'refunds: expected 378, got %', v; end if;

  select count(*) into v from public.refunds where timepoint = 't1';
  if v <> 365 then raise exception 't1 refunds: expected 365, got %', v; end if;

  select count(*) into v from public.refunds r
    join (values ('REF-2026-001','t0','HYBRID'), ('REF-2026-021','t1','HYBRID'),
                 ('REF-2026-031','t3','AURA'),   ('REF-2026-032','t3','AURA'),
                 ('REF-2026-033','t3','AURA'),   ('REF-2026-034','t3','AURA'),
                 ('REF-2026-170','t4','HYBRID'), ('REF-2026-171','t4','HYBRID'),
                 ('REF-2026-172','t4','HYBRID'), ('REF-2026-173','t4','HYBRID'),
                 ('REF-2026-014','t5','HYBRID'), ('REF-2026-045','t8','HYBRID'),
                 ('REF-2026-210','t9','NOVA'),   ('REF-2026-211','t9','MERIDIAN'))
      as e(id, tp, iss)
      on r.refund_id = e.id and r.timepoint = e.tp and r.issuer_id = e.iss;
  if v <> 14 then raise exception 'scenario refunds: expected 14 matches, got %', v; end if;

  select count(*) into v from public.refunds where cancel_tx_id is null or cardholder_id is null;
  if v <> 0 then raise exception '% refunds without cardholder or cancellation', v; end if;

  select count(*) into v from public.refunds where maturity_override_seconds = 120;
  if v <> 6 then raise exception 'short-maturity refunds: expected 6, got %', v; end if;

  select count(*) into v from public.transactions;
  if v <> 378 * 2 then raise exception 'transactions: expected 756, got %', v; end if;

  raise notice 'seed ok: 378 refunds (t1 365), 756 transactions, % cardholders',
    (select count(*) from public.cardholders);
end $$;

commit;
