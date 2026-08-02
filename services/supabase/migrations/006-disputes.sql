-- 006: what each side said when a rental went wrong, and what the agent decided
--
-- Two tables, because they answer to different people. Evidence is written by the two
-- parties and is theirs. The verdict log is written by the server and is a record of what
-- an automated system did with somebody's money, which is exactly the kind of thing that
-- has to be readable afterwards by a human who was not there.
--
-- Neither carries an amount. The contract reads the deposit from its own storage and does
-- the arithmetic, so nothing here can move money by being wrong; the worst a bad row does
-- is describe a decision inaccurately.

begin;

create table if not exists dispute_evidence (
  id                bigserial primary key,
  onchain_rental_id bigint not null,
  -- Which side of the rental this came from, worked out on the server by reading the
  -- rental off the chain. Never taken from the request.
  side              text not null check (side in ('owner', 'renter')),
  author_address    wallet_address not null,
  statement         text not null,
  image_path        text,
  -- The database clock, deliberately. CLAUDE.md section 9 is explicit: a photo's own EXIF
  -- timestamp can be rewritten in seconds, and this timestamp is evidence an agent uses to
  -- split a deposit. What is recorded is when the server received the file.
  created_at        timestamptz not null default now(),
  -- One submission per side. Letting somebody file twice would let them keep adding
  -- material after seeing what the other one said.
  unique (onchain_rental_id, side)
);

create index if not exists dispute_evidence_rental_idx on dispute_evidence (onchain_rental_id);

create table if not exists dispute_verdicts (
  id                bigserial primary key,
  onchain_rental_id bigint not null unique,
  verdict           text not null check (verdict in ('refund_renter', 'split', 'pay_owner')),
  confidence        numeric(3, 2) not null,
  reason            text not null,
  -- Whether the server went on to sign. A verdict the agent reached but nobody acted on
  -- is still worth keeping: it is the record of why a dispute is sitting there waiting
  -- for a human.
  signed            boolean not null default false,
  tx_hash           text,
  -- Why it was not signed, when it was not. Empty on the happy path.
  held_back_reason  text,
  model             text not null,
  created_at        timestamptz not null default now()
);

alter table dispute_evidence enable row level security;
alter table dispute_verdicts enable row level security;

-- No anon policies. Evidence is between the two parties and the arbitrator, and the
-- verdict log is read through an admin route that checks a code first. Everything here
-- goes through the service role key.

commit;
