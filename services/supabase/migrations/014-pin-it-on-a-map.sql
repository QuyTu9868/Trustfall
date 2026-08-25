-- The exact spot a listing is collected from, chosen on a map at publish time and shown
-- publicly on the listing right away. Nullable: a listing published before this existed, or
-- one where the owner skipped the map, still has pickup_area to fall back on.
alter table listings add column if not exists lat double precision;
alter table listings add column if not exists lng double precision;
