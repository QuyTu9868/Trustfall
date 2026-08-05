-- 011: one more word, after the ruling
--
-- The arbitrator runs at temperature zero, which means asking it the same question again
-- gets the same answer. So an appeal that only says "look again" is theatre. An appeal here
-- has to carry something the agent did not have: an argument, a correction, a piece of
-- context neither statement mentioned.
--
-- One per side, like the statements, and for the same reason: a second bite lets somebody
-- keep adding material after reading the reply.
--
-- What happens next depends on where the money is. If the deposit has not moved, the
-- dispute is judged again with the appeal added. If it has, nothing here can undo it, and
-- the appeal is a record for the human resolver rather than a lever. The route says which,
-- and the screen says it in those words: an appeal button that quietly does nothing is
-- worse than no button.

begin;

create table if not exists dispute_appeals (
  id                bigserial primary key,
  onchain_rental_id bigint not null,
  side              text not null check (side in ('owner', 'renter')),
  author_address    wallet_address not null,
  statement         text not null,
  -- True when the deposit had already been paid out by the time this was filed, so the
  -- appeal could not change anything on chain and is waiting for a person.
  after_settlement  boolean not null default false,
  created_at        timestamptz not null default now(),
  unique (onchain_rental_id, side)
);

create index if not exists dispute_appeals_rental_idx on dispute_appeals (onchain_rental_id);

alter table dispute_appeals enable row level security;

commit;
