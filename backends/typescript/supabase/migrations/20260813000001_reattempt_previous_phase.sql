-- Keep the server-side ladder aligned with the local app: correct answers move
-- forward one phase and incorrect answers move back one phase.
create or replace function advance_reattempt(reattempt_id uuid, result text)
returns void language plpgsql security definer as $$
declare
  cur_stage reattempt_stage_t;
  next_date date;
  next_stage reattempt_stage_t;
begin
  select stage into cur_stage from reattempts where id = reattempt_id;

  if result = 'clean' then
    if cur_stage = 'D3' then
      next_stage := 'D10';
      next_date := current_date + 10;
    elsif cur_stage = 'D10' then
      next_stage := 'D30';
      next_date := current_date + 30;
    elsif cur_stage = 'D30' then
      next_stage := 'MASTERED';
      next_date := null;
    else
      next_stage := cur_stage;
      next_date := null;
    end if;
  else
    if cur_stage = 'D30' then
      next_stage := 'D10';
      next_date := current_date + 10;
    elsif cur_stage = 'MASTERED' then
      next_stage := 'D30';
      next_date := current_date + 30;
    else
      next_stage := 'D3';
      next_date := current_date + 3;
    end if;
  end if;

  update reattempts
    set stage = next_stage,
        scheduled_date = coalesce(next_date, scheduled_date),
        history = history || jsonb_build_object(
          'date', current_date, 'result', result)
    where id = reattempt_id;
end $$;
