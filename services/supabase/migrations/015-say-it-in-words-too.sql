-- A free-text address, separate from pickup_area (the ward/district/province picker) and
-- from lat/lng (the map pin). None of the three is derived from another: an owner can type
-- a building name or a street number here that the pin alone would not say, and the two can
-- disagree without either being wrong, the way a real address and a real pin sometimes do.
alter table listings add column if not exists street_address text;
