-- 001: rentals live on the chain, not here
--
-- The original schema mirrored every rental into a `rentals` table and had chat and
-- reviews point at it with a foreign key. Nothing ever wrote to that table: the escrow
-- contract is the source of truth and the app reads rentals from it directly, so the
-- foreign key pointed at rows that were never going to exist and no review could be
-- inserted at all.
--
-- This drops the empty mirror and re-keys chat and reviews on the on-chain rental id.
-- There is no foreign key to replace it because the thing being referenced is not in
-- this database. The API routes read the rental from the chain and check who is asking
-- before writing, which is a stronger check than a foreign key was ever going to be.
--
-- Safe to run on the existing database: all three tables are empty.

begin;

drop table if exists messages;
drop table if exists reviews;
drop table if exists rentals;

create table messages (
  id                bigserial primary key,
  onchain_rental_id bigint not null,
  sender_address    wallet_address not null,
  body              text not null,
  created_at        timestamptz not null default now()
);

create index messages_thread_idx on messages (onchain_rental_id, created_at);

create table reviews (
  id                uuid primary key default gen_random_uuid(),
  onchain_rental_id bigint not null,
  reviewer_address  wallet_address not null,
  reviewee_address  wallet_address not null,
  rating            smallint not null check (rating between 1 and 5),
  comment           text,
  created_at        timestamptz not null default now(),
  -- One review per side. The database refuses a second one rather than the API route
  -- having to check first and race with itself.
  unique (onchain_rental_id, reviewer_address)
);

create index reviews_reviewee_idx on reviews (reviewee_address);

alter table messages enable row level security;
alter table reviews  enable row level security;

-- Reviews are meant to be read by anyone looking at a listing. Chat is not, so it gets
-- no anon policy and stays reachable only through the service role key.
create policy public_read on reviews for select using (true);

commit;
