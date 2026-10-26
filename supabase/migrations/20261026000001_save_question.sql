-- Білімтест: сохранение вопроса из админки.
--
-- Вопрос и его варианты сохраняются одним вызовом, то есть одной транзакцией. Проверка
-- «опубликованный вопрос полный» срабатывает в конце транзакции, поэтому можно, например,
-- сменить правильный ответ у опубликованного вопроса. По отдельным запросам это дало бы ошибку.
--
-- security invoker: функция работает с правами вызвавшего, все правила доступа (RLS) действуют.

-- p_id      — id вопроса или null для нового;
-- p_q       — {"topic_id", "text_kk", "text_ru", "text_en", "explanation_kk", "explanation_ru",
--              "explanation_en", "image_url", "difficulty", "status", "review_comment"};
-- p_options — [{"text_kk", "text_ru", "text_en", "is_correct"}, …] по порядку, не больше 4.
-- Возвращает id вопроса.
create function public.save_question(p_id uuid, p_q jsonb, p_options jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := p_id;
  v_n int := coalesce(jsonb_array_length(p_options), 0);
  v_status public.question_status := coalesce(p_q ->> 'status', 'draft')::public.question_status;
  v_admin boolean := public.is_admin();
begin
  if jsonb_typeof(p_options) is distinct from 'array' or v_n > 4 then
    raise exception 'Нужно не больше 4 вариантов ответа' using errcode = 'check_violation';
  end if;

  if v_id is null then
    insert into public.questions (topic_id, text_kk, text_ru, text_en, explanation_kk, explanation_ru,
      explanation_en, image_url, difficulty, status, sort_order)
    select (p_q ->> 'topic_id')::uuid, p_q ->> 'text_kk', p_q ->> 'text_ru', p_q ->> 'text_en',
      p_q ->> 'explanation_kk', p_q ->> 'explanation_ru', p_q ->> 'explanation_en', p_q ->> 'image_url',
      coalesce((p_q ->> 'difficulty')::smallint, 2), v_status,
      coalesce((select max(sort_order) + 1 from public.questions where topic_id = (p_q ->> 'topic_id')::uuid), 0)
    returning id into v_id;
  else
    -- updated_at меняется всегда: так история сохраняет прежнюю версию, даже если правились только варианты.
    update public.questions set
      topic_id = (p_q ->> 'topic_id')::uuid,
      text_kk = p_q ->> 'text_kk', text_ru = p_q ->> 'text_ru', text_en = p_q ->> 'text_en',
      explanation_kk = p_q ->> 'explanation_kk', explanation_ru = p_q ->> 'explanation_ru',
      explanation_en = p_q ->> 'explanation_en',
      image_url = p_q ->> 'image_url',
      difficulty = coalesce((p_q ->> 'difficulty')::smallint, difficulty),
      status = v_status,
      -- комментарий проверки пишет только админ; у опубликованного вопроса он больше не нужен
      review_comment = case when v_status = 'published' then null
                            when v_admin then nullif(trim(p_q ->> 'review_comment'), '')
                            else review_comment end,
      updated_at = now()
    where id = v_id;
    if not found then
      raise exception 'Вопрос не найден или нет прав на его изменение' using errcode = '42501';
    end if;
  end if;

  -- Варианты: номер 0–3 сохраняет id варианта, лишние удаляются.
  insert into public.options as o (question_id, sort_order, text_kk, text_ru, text_en, is_correct)
  select v_id, (x.n - 1)::smallint, x.v ->> 'text_kk', x.v ->> 'text_ru', x.v ->> 'text_en',
    coalesce((x.v ->> 'is_correct')::boolean, false)
  from jsonb_array_elements(p_options) with ordinality as x(v, n)
  on conflict (question_id, sort_order) do update set
    text_kk = excluded.text_kk, text_ru = excluded.text_ru, text_en = excluded.text_en,
    is_correct = excluded.is_correct;
  delete from public.options where question_id = v_id and sort_order >= v_n;

  return v_id;
end $$;

revoke execute on function public.save_question(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_question(uuid, jsonb, jsonb) to authenticated;
