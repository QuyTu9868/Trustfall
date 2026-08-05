-- 010: what the listing checker decided, and why
--
-- Half the agent work in this project happens at publish time and left no trace at all.
-- The owner saw an approval or a rejection with reasons, and that was the end of it: no
-- record, nothing in the admin log, no way to ask afterwards why a listing was refused or
-- to notice that the checker had started refusing things it used to allow.
--
-- The arbitrator has been answerable since migration 006 because it moves money. This one
-- does not move money, and is still worth the same treatment: it decides who gets to trade
-- here, it can be wrong in both directions, and a rejection an owner cannot appeal because
-- nobody kept the reasoning is a rejection they simply walk away from.
--
-- Not unique per listing. A rejected listing is meant to be fixed and submitted again, so
-- the rows accumulate and the sequence is the interesting part.

begin;

create table if not exists listing_checks (
  id          bigserial primary key,
  listing_id  uuid references listings (id) on delete cascade,
  decision    text not null check (decision in ('approve', 'reject')),
  -- What the owner was told, which is the part they can act on.
  reasons     jsonb not null default '[]'::jsonb,
  -- Where each of those came from, in the checker's own words. Same shape and the same
  -- purpose as dispute_verdicts.findings: a claim that can be checked against its source.
  findings    jsonb not null default '[]'::jsonb,
  model       text not null,
  created_at  timestamptz not null default now()
);

create index if not exists listing_checks_listing_idx on listing_checks (listing_id, created_at);

alter table listing_checks enable row level security;

-- No anon policies. Read through the admin route, written with the service role key.

commit;
