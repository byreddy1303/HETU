-- Advance the D3 → D10 → D30 → MASTERED ladder.
create or replace function advance_reattempt(reattempt_id uuid, result text)
returns void language plpgsql security definer as $$
declare
  cur_stage reattempt_stage_t;
  next_date date;
  next_stage reattempt_stage_t;
begin
  select stage into cur_stage from reattempts where id = reattempt_id;
  if result = 'clean' then
    if cur_stage = 'D3'  then next_stage := 'D10';     next_date := current_date + 10;
    elsif cur_stage = 'D10' then next_stage := 'D30';  next_date := current_date + 30;
    elsif cur_stage = 'D30' then next_stage := 'MASTERED'; next_date := null;
    else next_stage := cur_stage; next_date := null;
    end if;
  else
    next_stage := 'D3';
    next_date := current_date + 3;
  end if;

  update reattempts
    set stage = next_stage,
        scheduled_date = coalesce(next_date, scheduled_date),
        history = history || jsonb_build_object(
          'date', current_date, 'result', result)
    where id = reattempt_id;
end $$;

-- Atomic increment of daily LLM usage. Returns new count.
create or replace function increment_llm_usage(uid uuid)
returns int language plpgsql security definer as $$
declare
  new_count int;
begin
  insert into llm_usage_daily (user_id, day, count)
    values (uid, current_date, 1)
    on conflict (user_id, day) do update
      set count = llm_usage_daily.count + 1
    returning count into new_count;
  return new_count;
end $$;
