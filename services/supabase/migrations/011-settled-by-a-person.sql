-- 011: which of the two decided it
--
-- The agent is still the only address the contract accepts, and that has not changed. What
-- changes is who chose the word it signs, for the one case where the agent could not: a
-- ruling the server refused to act on, because the confidence was below the bar or because
-- the gateway turned it away.
--
-- Those disputes had exactly one way out before this, and it was a timeout. Seven days
-- after opening, anyone can finalise and the deposit goes to the renter. That is the right
-- default when nobody is watching and the wrong answer when the owner was in the right and
-- the machine merely hesitated.
--
-- Null means the arbitrator. A row only gains a value here when a person stepped in, so the
-- log can never quietly attribute a human decision to the model.

begin;

alter table dispute_verdicts
  add column if not exists settled_by text
    check (settled_by is null or settled_by in ('admin'));

-- What the person said, kept apart from the arbitrator's own reason. Overwriting `reason`
-- would erase the thing being overruled, and a log that loses the original decision cannot
-- be used to check the one that replaced it.
alter table dispute_verdicts
  add column if not exists settled_note text;

commit;
