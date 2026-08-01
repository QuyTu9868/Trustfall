-- 002: what a notification is attached to, and where an email goes
--
-- Two changes, both needed before checkpoint 8 can work.
--
-- 1. profiles.email. Privy knows the email of whoever is signed in, but only in their own
--    browser. When a renter sends a request it is the owner who needs telling, and the
--    renter's session says nothing about the owner. So each person deposits their own
--    address on their own way in, via /api/profile, from a verified token.
--
-- 2. notifications.onchain_rental_id, plus a uniqueness rule. Notifications are written
--    after a transaction confirms, from the browser that sent it. Browsers get refreshed
--    and requests get retried, so without a key to collide on, one approval would leave
--    four identical rows in the bell. The unique index turns a retry into an update.

begin;

alter table profiles add column if not exists email text;

-- Profiles stay publicly readable so a listing can show a name, but an email address is
-- not something to hand out alongside it. Column level grants let anon read the rest and
-- nothing more. The API routes use the service role key and are unaffected.
revoke select on profiles from anon;
grant select (address, display_name, avatar_url, created_at) on profiles to anon;

alter table notifications add column if not exists onchain_rental_id bigint;

-- One live notification per person, per kind, per rental. A second message in the same
-- thread refreshes the existing unread row rather than stacking another one up.
create unique index if not exists notifications_one_per_event
  on notifications (recipient_address, kind, onchain_rental_id);

commit;
