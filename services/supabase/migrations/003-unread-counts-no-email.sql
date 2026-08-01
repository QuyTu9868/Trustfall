-- 003: count unread messages instead of emailing about them
--
-- Reverses the email half of 002. Holding people's email addresses means being the reason
-- they leak, and a rental app has no business doing that for a notification a badge can
-- carry. The badge is also better: it says how many, and it is on screen where the
-- conversation is rather than in a different inbox.
--
-- Two things make the count possible without asking the chain on every poll.
--
-- 1. messages.recipient_address. The route already works out who the other party is when
--    it stores a message, so it records that instead of throwing it away. Counting then
--    needs no idea of who is in which rental: unread means addressed to me and newer than
--    the last time I looked.
--
-- 2. thread_reads. One row per person per conversation, holding the moment they last had
--    it open. Storing a timestamp rather than a per message read flag keeps this one row
--    per thread no matter how long the conversation runs.

begin;

alter table profiles drop column if exists email;

-- 002 narrowed anon to named columns so it could not read the email. There is no email
-- any more, so the whole row goes back to being public.
revoke select on profiles from anon;
grant select on profiles to anon;

alter table messages add column if not exists recipient_address wallet_address;

create index if not exists messages_unread_idx
  on messages (recipient_address, onchain_rental_id, created_at);

create table if not exists thread_reads (
  address           wallet_address not null,
  onchain_rental_id bigint not null,
  last_read_at      timestamptz not null default now(),
  primary key (address, onchain_rental_id)
);

alter table thread_reads enable row level security;

-- No anon policy: when somebody last read their messages is nobody else's business, and
-- only the API routes touch this, through the service role key.

-- The message notification kind is gone too, replaced by the badge. Clearing the old rows
-- stops a stale bell entry pointing at a mechanism that no longer exists.
delete from notifications where kind = 'message';

commit;
