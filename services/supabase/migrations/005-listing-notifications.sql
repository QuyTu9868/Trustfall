-- 005: notifications about a listing, not only about a rental
--
-- Listings are now written before they are checked, so that pressing refresh during the
-- wait no longer throws away a description and two photos. The consequence is that the
-- verdict arrives after the page that asked for it may be gone, so it has to be delivered
-- rather than returned, and the bell is where it goes.
--
-- A notification therefore points at one of two things. The existing unique index covers
-- (recipient, kind, onchain_rental_id), and a second one covers the listing case. Postgres
-- treats NULLs as distinct in a unique index, so a single index spanning both columns
-- would quietly stop deduplicating the moment one of them was null.

begin;

alter table notifications add column if not exists listing_id uuid references listings (id) on delete cascade;

create unique index if not exists notifications_one_per_listing_event
  on notifications (recipient_address, kind, listing_id)
  where listing_id is not null;

-- The rental index needs the same treatment for the same reason: rows about a listing
-- have a null rental id, and without this they would all collide with each other.
drop index if exists notifications_one_per_event;
create unique index if not exists notifications_one_per_event
  on notifications (recipient_address, kind, onchain_rental_id)
  where onchain_rental_id is not null;

commit;
