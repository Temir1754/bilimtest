-- Жалобы учеников и автоскрытие вопроса (этап 4, DECISIONS.md №95, №99).
--
-- 1. reports.client — кто пожаловался: ученик без входа узнаётся по адресу (client_key, тот же хэш, что
--    у лимитов частоты). «Разные люди» — разные user_id, а у гостей — разные адреса. Класс в школе с одним
--    адресом считается одним человеком: так один ученик не скроет вопрос, нажав три раза.
-- 2. Когда на опубликованный вопрос пожаловались limits.reports_to_hide разных людей (по умолчанию 3) —
--    вопрос сам уходит в «Тексеруде» (ученикам не виден) с текстами жалоб в комментарии. Автор видит его
--    у себя во вкладке «Тексеруде», доверенный учитель исправляет и публикует сам. Админу делать ничего не нужно.
-- 3. submit_report отвечает {ok: true}, а при скрытии — {ok: true, hidden: true}.

alter table public.reports add column client text;

update public.app_settings set value = value || '{"reports_to_hide": 3}' where key = 'limits';

create or replace function public.submit_report(p_question_id uuid, p_message text, p_lang public.lang_code default null,
  p_trap text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  msg text := trim(coalesce(p_message, ''));
  v_people int;
begin
  if coalesce(p_trap, '') <> '' then
    return jsonb_build_object('ok', true); -- боту отвечаем «принято», но ничего не сохраняем
  end if;
  if length(msg) not between 3 and 1000 then
    return jsonb_build_object('ok', false, 'reason', 'bad_message');
  end if;
  if not exists (select 1 from public.questions where id = p_question_id and status = 'published') then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if not public.hit_rate_limit('report', public.setting_int('reports_per_hour', 30), interval '1 hour') then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  insert into public.reports (question_id, message, lang, user_id, client)
  values (p_question_id, msg, p_lang, auth.uid(), public.client_key());

  select count(distinct coalesce(user_id::text, client)) into v_people
    from public.reports where question_id = p_question_id and status = 'new';
  if v_people < public.setting_int('reports_to_hide', 3) then
    return jsonb_build_object('ok', true);
  end if;

  update public.questions set status = 'review', review_comment = left('Оқушылар қате туралы хабарлады / Ученики сообщили об ошибке: '
      || (select string_agg(r.message, ' | ' order by r.created_at) from public.reports r
           where r.question_id = p_question_id and r.status = 'new'), 1000)
   where id = p_question_id;
  return jsonb_build_object('ok', true, 'hidden', true);
end $$;
