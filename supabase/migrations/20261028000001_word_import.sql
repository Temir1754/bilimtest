-- Загрузка из Word и гибкий Excel (DECISIONS.md №91).
--
-- 1. import_questions: у строки может быть topic_id — тема программы, выбранная в таблице-предпросмотре.
--    Тема должна быть в выбранном предмете и классе и не скрыта. Без topic_id — как раньше: по названию.
-- 2. Отдельный лимит загрузки учителя в сутки: limits.teacher_imports_per_day (по умолчанию 300).
--    Вопросы из файла помечены imported и не тратят обычный лимит черновиков (50); черновики из формы
--    не тратят лимит загрузки. Админ — без лимитов.

alter table public.questions add column imported boolean not null default false;

update public.app_settings set value = value || '{"teacher_imports_per_day": 300}' where key = 'limits';

create or replace function public.check_teacher_draft_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_limit int := case when new.imported then public.setting_int('teacher_imports_per_day', 300)
                      else public.setting_int('teacher_drafts_per_day', 50) end;
  v_since timestamptz := date_trunc('day', now() at time zone 'Asia/Almaty') at time zone 'Asia/Almaty';
begin
  if public.my_role() = 'teacher' and (
    select count(*) from public.questions
     where author_id = auth.uid() and created_at >= v_since and imported = new.imported) >= v_limit then
    if new.imported then
      raise exception 'Дневной лимит загрузки: %', v_limit using errcode = 'check_violation';
    end if;
    raise exception 'Дневной лимит черновиков: %', v_limit using errcode = 'check_violation';
  end if;
  return new;
end $$;

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
    if jsonb_array_length(coalesce(r -> 'options', '[]')) > 4 then
      raise exception 'Нужно не больше 4 вариантов ответа' using errcode = 'check_violation';
    end if;

    v_topic := null;
    if nullif(r ->> 'topic_id', '') is not null then
      select id into v_topic from public.topics
       where id::text = r ->> 'topic_id' and subject_id = p_subject_id and grade = p_grade and not archived;
      if v_topic is null then
        raise exception 'Тема не найдена в этом предмете и классе' using errcode = 'check_violation';
      end if;
    else
      v_title := trim(coalesce(r ->> 'topic', ''));
      if v_title = '' then
        raise exception 'У вопроса не указана тема' using errcode = 'check_violation';
      end if;
      -- Скрытая тема не находится по названию (иначе вопросы попали бы в невидимую тему).
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
    end if;

    insert into public.questions (topic_id, text_kk, text_ru, text_en, explanation_kk, explanation_ru,
      explanation_en, difficulty, status, sort_order, imported)
    values (v_topic, nullif(trim(r ->> 'text_kk'), ''), nullif(trim(r ->> 'text_ru'), ''),
      nullif(trim(r ->> 'text_en'), ''), nullif(trim(r ->> 'explanation_kk'), ''),
      nullif(trim(r ->> 'explanation_ru'), ''), nullif(trim(r ->> 'explanation_en'), ''),
      coalesce((r ->> 'difficulty')::smallint, 2), 'draft',
      coalesce((select max(sort_order) + 1 from public.questions where topic_id = v_topic), 0), true)
    returning id into v_id;

    insert into public.options (question_id, sort_order, text_kk, text_ru, text_en, is_correct)
    select v_id, (x.n - 1)::smallint, nullif(trim(x.v ->> 'text_kk'), ''), nullif(trim(x.v ->> 'text_ru'), ''),
      nullif(trim(x.v ->> 'text_en'), ''), coalesce((x.v ->> 'is_correct')::boolean, false)
    from jsonb_array_elements(coalesce(r -> 'options', '[]')) with ordinality as x(v, n);

    v_questions := v_questions + 1;
  end loop;

  return jsonb_build_object('questions', v_questions, 'topics', v_topics);
end $$;
