-- 012: a line of writing beside the handover photograph
--
-- A photograph on its own says "look at this" without saying what to look at. The person
-- receiving it has to guess whether the point is the scratch on the bumper, the mileage on
-- the dash, or that everything is fine. That guess is exactly what a dispute is made of.
--
-- Nullable, because most handovers have nothing to say and forcing a sentence out of
-- somebody produces "ok" and teaches everyone to ignore the field.

begin;

alter table handover_photos
  add column if not exists note text;

commit;
