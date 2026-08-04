-- 008: the steps, not just the conclusion
--
-- A verdict came with one sentence of reasoning. That is the right length for the two
-- people involved, who mostly want to know the outcome and whether it was fair. It is the
-- wrong length for anybody auditing the agent, because a single sentence cannot be checked
-- against the evidence: it says what the arbitrator concluded and not what it read to get
-- there, so "the renter admitted it" and an invented admission look identical.
--
-- findings is a list of {from, says}. Each entry names the source it came out of, so a
-- reader can go to that source and see whether it says what the agent claims. An entry
-- attributed to a photograph on a dispute where no photograph was filed is a caught
-- hallucination, which is exactly the kind of thing a log is for.

begin;

alter table dispute_verdicts
  add column if not exists findings jsonb not null default '[]'::jsonb;

commit;
