-- 009: what the item looked like when it changed hands
--
-- A dispute is an argument about a change of state, and until now the only pictures in the
-- system were taken after the argument had already started. Both sides photograph whatever
-- helps them, which is the shape of evidence that persuades nobody: there is no before.
--
-- These are taken at the two moments the contract already treats as significant, by the
-- party receiving the item, and they are what a before and after comparison needs.
--
-- One per phase, and no editing. A second upload replacing the first would let somebody
-- swap the picture once they knew what they were arguing about, which is the whole thing
-- this is meant to prevent.

begin;

create table if not exists handover_photos (
  id                bigserial primary key,
  onchain_rental_id bigint not null,
  phase             text not null check (phase in ('checkin', 'checkout')),
  image_path        text not null,
  -- Who uploaded it, checked against the chain before the row is written: the renter
  -- receives at check-in and the owner receives it back at check-out.
  uploaded_by       wallet_address not null,
  -- The database clock, deliberately, and the reason this table is worth having at all.
  -- CLAUDE.md section 9: a photo's own EXIF timestamp can be rewritten in seconds, so a
  -- picture is only evidence of when if the server writes the time it arrived.
  created_at        timestamptz not null default now(),
  unique (onchain_rental_id, phase)
);

create index if not exists handover_photos_rental_idx on handover_photos (onchain_rental_id);

alter table handover_photos enable row level security;

-- No anon policies, same as the dispute tables. These are read by the two parties through
-- routes that check a session, and by the arbitrator through the service role key.

commit;
