-- 007: record what the arbitrator actually looked at
--
-- The arbitrator is sent the statements, the conversation, and the photographs both sides
-- filed. It has not always been: for a while the pictures were withheld because a two photo
-- dispute did not fit inside the previous provider's per minute allowance, and a photograph
-- that fails to download is still withheld today.
--
-- What it read has to be written down next to the ruling rather than known by whoever
-- configured it. A log that shows photographs beside a verdict, without saying whether that
-- verdict was reached with them, misleads precisely the person reading it to find out how a
-- decision about somebody's deposit was made.

begin;

alter table dispute_verdicts
  add column if not exists evidence_seen text not null default 'statements and conversation';

commit;
