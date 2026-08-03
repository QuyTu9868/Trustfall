-- 007: record what the arbitrator actually looked at
--
-- Photographs are filed, stored and shown to both parties and to the admin log, but they
-- are not sent to the model: a two photo dispute does not fit inside the free tier's per
-- minute allowance, measured every way there is. The verdict therefore comes from the
-- statements and the conversation alone.
--
-- That has to be written down next to the verdict rather than known by whoever configured
-- it. A log that shows the photographs beside a ruling, without saying the ruling was
-- reached without them, is a record that misleads precisely the person reading it to find
-- out how a decision about somebody's deposit was made.

begin;

alter table dispute_verdicts
  add column if not exists evidence_seen text not null default 'statements and conversation';

commit;
