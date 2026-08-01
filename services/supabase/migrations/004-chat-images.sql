-- 004: a photo in a message
--
-- Handing something over goes wrong in ways that are easier to show than to describe. A
-- scratch on a wing mirror, the meeting spot, the state of a dress before it went out.
-- The dispute agent at checkpoint 10 reads photos for exactly this reason, and the chat
-- is where the two of them are already talking.
--
-- One image per message, not an album. A message is either a line of text or a picture
-- with an optional line under it, which is what a chat actually looks like and avoids a
-- join table for something nobody asked for.

begin;

-- The storage path, not a URL. The bucket is private, so what the browser gets is a
-- signed link minted per request and good for an hour. Storing a URL would mean storing
-- one that expires, or making the bucket public and letting anyone who ever saw a link
-- keep the photo forever.
alter table messages add column if not exists image_path text;

-- Body was required because a message with nothing in it is not a message. A picture is
-- something in it, so the rule becomes "at least one of the two".
alter table messages alter column body drop not null;
alter table messages
  drop constraint if exists messages_has_content;
alter table messages
  add constraint messages_has_content
  check (coalesce(body, '') <> '' or image_path is not null);

commit;
