-- Trustfall off-chain schema. Paste into the Supabase SQL Editor and run.
--
-- Everything money-related lives on chain. This database only holds the parts that
-- need to be fast and cheap: listings, images, chat, reviews, notifications.
-- See CLAUDE.md section 5 for the on-chain / off-chain split.
--
-- Also create a Storage bucket named "listing-images" with public read access.

-- Wallet addresses are always stored lowercase. Mixed case is the classic source of
-- lookups that silently return nothing.
create domain wallet_address as text
  check (value = lower(value) and value ~ '^0x[0-9a-f]{40}$');

-- 1. Profiles ---------------------------------------------------------------

create table profiles (
  address      wallet_address primary key,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

-- 2. Listings ---------------------------------------------------------------

create table listings (
  id                uuid primary key default gen_random_uuid(),
  owner_address     wallet_address not null,
  category          text not null check (category in ('house', 'vehicle', 'clothing')),
  title             text not null,
  description       text not null,
  -- USDC amounts, 6 decimals. Kept numeric so the price hint can take a median.
  price_per_day     numeric(20, 6) not null check (price_per_day > 0),
  deposit           numeric(20, 6) not null check (deposit >= 0),
  status            text not null default 'draft'
                      check (status in ('draft', 'published', 'unlisted')),
  -- Filled in by the moderation agent. A rejection must carry a reason so the
  -- owner can fix the listing and submit again.
  moderation_status text not null default 'pending'
                      check (moderation_status in ('pending', 'approved', 'rejected')),
  moderation_reason text,
  created_at        timestamptz not null default now()
);

create index listings_browse_idx on listings (category, status);
create index listings_owner_idx on listings (owner_address);

-- 3. Listing images ---------------------------------------------------------

create table listing_images (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings (id) on delete cascade,
  url        text not null,
  sort_order smallint not null default 0,
  -- Server clock at upload time. Never read this from EXIF: EXIF is trivial to
  -- edit, and this timestamp is evidence the dispute agent uses to split money.
  uploaded_at timestamptz not null default now()
);

create index listing_images_listing_idx on listing_images (listing_id, sort_order);

-- 4. Rentals ----------------------------------------------------------------
-- The contract is the source of truth. These rows mirror it so the UI can list
-- and filter without reading the chain on every request.

create table rentals (
  id                uuid primary key default gen_random_uuid(),
  onchain_rental_id bigint unique,
  listing_id        uuid not null references listings (id),
  renter_address    wallet_address not null,
  start_date        date not null,
  end_date          date not null,
  status            text not null default 'requested'
                      check (status in ('requested', 'approved', 'active',
                                        'returned', 'completed', 'cancelled',
                                        'disputed')),
  created_at        timestamptz not null default now(),
  check (end_date >= start_date)
);

create index rentals_listing_idx on rentals (listing_id);
create index rentals_renter_idx on rentals (renter_address);

-- 5. Chat -------------------------------------------------------------------

create table messages (
  id         bigserial primary key,
  rental_id  uuid not null references rentals (id) on delete cascade,
  sender_address wallet_address not null,
  body       text not null,
  created_at timestamptz not null default now()
);

create index messages_thread_idx on messages (rental_id, created_at);

-- 6. Reviews ----------------------------------------------------------------
-- Two-way: owner reviews renter, renter reviews owner. One review per side.
-- Only opens when the rental reaches Completed, enforced in the API route.

create table reviews (
  id               uuid primary key default gen_random_uuid(),
  rental_id        uuid not null references rentals (id) on delete cascade,
  reviewer_address wallet_address not null,
  reviewee_address wallet_address not null,
  rating           smallint not null check (rating between 1 and 5),
  comment          text,
  created_at       timestamptz not null default now(),
  unique (rental_id, reviewer_address)
);

create index reviews_reviewee_idx on reviews (reviewee_address);

-- 7. Notifications ----------------------------------------------------------

create table notifications (
  id                bigserial primary key,
  recipient_address wallet_address not null,
  kind              text not null,
  body              text not null,
  is_read           boolean not null default false,
  created_at        timestamptz not null default now()
);

create index notifications_inbox_idx on notifications (recipient_address, is_read);

-- 8. Row level security -----------------------------------------------------
-- Reads are public: this is a marketplace, listings and reviews are meant to be
-- seen. Writes go through Next.js API routes using the service role key, which
-- bypasses RLS. No write policy exists for anon, so the browser cannot write
-- directly even with the anon key.

alter table profiles       enable row level security;
alter table listings       enable row level security;
alter table listing_images enable row level security;
alter table rentals        enable row level security;
alter table messages       enable row level security;
alter table reviews        enable row level security;
alter table notifications  enable row level security;

create policy public_read on profiles       for select using (true);
create policy public_read on listings       for select using (true);
create policy public_read on listing_images for select using (true);
create policy public_read on rentals        for select using (true);
create policy public_read on reviews        for select using (true);

-- Chat and notifications are not public. Only the API route reads them, using
-- the service role key, so they get no anon select policy at all.
