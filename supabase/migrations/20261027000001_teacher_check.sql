-- Білімтест: пометка «требует проверки учителем» у вопроса и скрытые (архивные) темы (DECISIONS.md №66–67).
--
-- teacher_check — что проверить учителю (пусто — проверять нечего). Так помечены старые вопросы,
-- для которых в новой программе не нашлось темы (строки ⛔ таблиц переноса). Снимает пометку админ.
-- archived — тема скрыта: её нет в админке, на сайте и в поиске темы при загрузке из Excel.
-- Скрываются пустые старые темы, на которые ещё ссылаются попытки, жалобы, статистика или история правок.

alter table public.questions add column teacher_check text check (length(teacher_check) <= 2000);
create index questions_teacher_check on public.questions (topic_id) where teacher_check is not null;

alter table public.topics add column archived boolean not null default false;

-- Загрузка из Excel: скрытая тема не находится по названию (иначе вопросы попали бы в невидимую тему).
create or replace function public.import_questions(p_subject_id uuid, p_grade int, p_rows jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  r jsonb;
  v_title text;
  v_topic uuid;
  v_id uuid;
  v_questions int := 0;
  v_topics int := 0;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 2000 then
    raise exception 'Нужно от 1 до 2000 вопросов за один раз' using errcode = 'check_violation';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_title := trim(coalesce(r ->> 'topic', ''));
    if v_title = '' then
      raise exception 'У вопроса не указана тема' using errcode = 'check_violation';
    end if;
    if jsonb_array_length(coalesce(r -> 'options', '[]')) > 4 then
      raise exception 'Нужно не больше 4 вариантов ответа' using errcode = 'check_violation';
    end if;

    select id into v_topic from public.topics
    where subject_id = p_subject_id and grade = p_grade and not archived
      and lower(v_title) in (lower(trim(title_kk)), lower(trim(title_ru)), lower(trim(title_en)))
    order by sort_order limit 1;
    if v_topic is null then
      -- Новая тема: название одно на все языки, перевести можно потом в админке.
      insert into public.topics (subject_id, grade, title_kk, title_ru, title_en, sort_order)
      values (p_subject_id, p_grade, v_title, v_title, v_title, coalesce(
        (select max(sort_order) + 1 from public.topics where subject_id = p_subject_id and grade = p_grade), 0))
      returning id into v_topic;
      v_topics := v_topics + 1;
    end if;

    insert into public.questions (topic_id, text_kk, text_ru, text_en, explanation_kk, explanation_ru,
      explanation_en, difficulty, status, sort_order)
    values (v_topic, nullif(trim(r ->> 'text_kk'), ''), nullif(trim(r ->> 'text_ru'), ''),
      nullif(trim(r ->> 'text_en'), ''), nullif(trim(r ->> 'explanation_kk'), ''),
      nullif(trim(r ->> 'explanation_ru'), ''), nullif(trim(r ->> 'explanation_en'), ''),
      coalesce((r ->> 'difficulty')::smallint, 2), 'draft',
      coalesce((select max(sort_order) + 1 from public.questions where topic_id = v_topic), 0))
    returning id into v_id;

    insert into public.options (question_id, sort_order, text_kk, text_ru, text_en, is_correct)
    select v_id, (x.n - 1)::smallint, nullif(trim(x.v ->> 'text_kk'), ''), nullif(trim(x.v ->> 'text_ru'), ''),
      nullif(trim(x.v ->> 'text_en'), ''), coalesce((x.v ->> 'is_correct')::boolean, false)
    from jsonb_array_elements(coalesce(r -> 'options', '[]')) with ordinality as x(v, n);

    v_questions := v_questions + 1;
  end loop;

  return jsonb_build_object('questions', v_questions, 'topics', v_topics);
end $$;
