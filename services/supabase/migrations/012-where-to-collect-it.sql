-- 012: where the thing actually is
--
-- A marketplace for renting real objects had nowhere to say where any of them were. You
-- have to go and collect a scooter, and the listing carried a title, a description, a price
-- and no hint of the city it was in.
--
-- An area, not an address, and the distinction is deliberate. A listing is public before
-- anybody books it, and publishing the exact spot somebody parks their car or keeps their
-- camera is a thing with consequences outside this app. A neighbourhood is enough to decide
-- whether to rent, and the two parties arrange the precise meeting point in the chat they
-- already have.
--
-- Free text rather than coordinates. CLAUDE.md section 7 rules out a map and searching by
-- location, and both of those are what coordinates are for. This is a line somebody types
-- and a line somebody reads, and the directions link hands it to whatever map application
-- the reader already has, which is the one piece of mapping this project should own.

begin;

alter table listings add column if not exists pickup_area text;

commit;
