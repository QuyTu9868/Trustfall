-- 013: the hop nobody could see
--
-- Every decision an agent makes leaves this app over HTTP and passes a Latch policy before
-- the server will sign anything. That hop is the reason the architecture is worth talking
-- about, and until now the only trace of it in the record was negative: held_back_reason
-- said "Blocked by policy" when a proposal was refused, and a proposal that sailed through
-- looked exactly like one that never went anywhere near a gateway.
--
-- So the passing case gets written down too. `gateway` holds what happened to the proposal
-- on its way to the signer:
--
--   passed   the policy read it and let it through, with its credential attached
--   blocked  a filter refused it, and gateway_note names which one and why
--   direct   no gateway in front of this server, which is the development arrangement
--
-- Null on every row written before this existed. That is honest: those rulings did go
-- through the gateway, but nothing recorded it, and backfilling a value nobody observed
-- would be inventing evidence on the one page built to be checked.

begin;

alter table dispute_verdicts
  add column if not exists gateway text
    check (gateway is null or gateway in ('passed', 'blocked', 'direct'));

-- Which filter, and what it said. Latch names the filter that refused in deniedBy, and that
-- name is the difference between "a policy stopped this" and a dead end.
alter table dispute_verdicts
  add column if not exists gateway_note text;

commit;
