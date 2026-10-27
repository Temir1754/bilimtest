-- Экран «Сұрақтар» в 3 шага (DECISIONS.md №87–89).
--
-- 1. Публикация (уточнение №26, №88): вопрос можно опубликовать, если он полный хотя бы на одном языке —
--    текст и все варианты. Ученик видит его только на тех языках, где он полный (этап 4).
--    У языкового предмета (only_lang) — как раньше: обязателен его язык.
-- 2. Учитель удаляет свой черновик или вопрос на проверке; опубликованный удаляет только админ (№89).
-- 3. Сколько опубликованных вопросов нужно теме: настройка limits.topic_min_questions (по умолчанию 5).
-- 4. topic_counts — число готовых вопросов в каждой теме класса для шагов 1 и 2.

-- ---------- 1. Полный ли вопрос на языке ----------

create function public.question_ready_in(p_id uuid, p_lang text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(trim(case p_lang when 'kk' then q.text_kk when 'ru' then q.text_ru else q.text_en end), '') <> ''
    and not exists (
      select 1 from public.options o where o.question_id = q.id
        and coalesce(trim(case p_lang when 'kk' then o.text_kk when 'ru' then o.text_ru else o.text_en end), '') = '')
  from public.questions q where q.id = p_id
$$;

create or replace function public.assert_question_publishable(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  q public.questions;
  v_lang public.lang_code;
  n int;
  n_correct int;
begin
  select * into q from public.questions where id = p_id;
  if not found or q.status <> 'published' then return; end if;

  select s.only_lang into v_lang
  from public.topics t join public.subjects s on s.id = t.subject_id where t.id = q.topic_id;

  select count(*), count(*) filter (where is_correct) into n, n_correct
  from public.options where question_id = p_id;
  if n not between 3 and 4 then
    raise exception 'Вопрос %: нужно 3–4 варианта ответа, сейчас %', p_id, n using errcode = 'check_violation';
  end if;
  if n_correct <> 1 then
    raise exception 'Вопрос %: нужен ровно один правильный ответ, сейчас %', p_id, n_correct using errcode = 'check_violation';
  end if;

  if v_lang is not null then
    if not public.question_ready_in(p_id, v_lang::text) then
      raise exception 'Вопрос %: нет текста на языке %', p_id, v_lang using errcode = 'check_violation';
    end if;
  elsif not (public.question_ready_in(p_id, 'kk') or public.question_ready_in(p_id, 'ru')
             or public.question_ready_in(p_id, 'en')) then
    raise exception 'Вопрос %: нет текста на языке kk, ru или en', p_id using errcode = 'check_violation';
  end if;
end $$;

-- ---------- 2. Учитель удаляет свой черновик ----------

create policy "вопросы: учитель удаляет свой черновик" on public.questions for delete to authenticated
  using ((select public.my_role()) = 'teacher' and author_id = (select auth.uid()) and status in ('draft', 'review'));

-- ---------- 3. Сколько вопросов нужно теме ----------

update public.app_settings set value = value || '{"topic_min_questions": 5}' where key = 'limits';

-- Настройки читает только админ, а число нужно и учителю — отдаёт функция.
create function public.topic_min_questions() returns int
language sql stable security definer set search_path = '' as $$
  select public.setting_int('topic_min_questions', 5)
$$;

-- ---------- 4. Готовые вопросы по темам класса ----------
-- ready — опубликованные вопросы, полные на языке p_lang (у языкового предмета — на его языке).
-- Темы без вопросов тоже в списке (ready = 0); скрытые темы — нет.

create function public.topic_counts(p_grade smallint, p_lang text)
returns table (topic_id uuid, subject_id uuid, ready int)
language sql stable security invoker set search_path = '' as $$
  select t.id, t.subject_id,
    count(q.id) filter (where public.question_ready_in(q.id, coalesce(s.only_lang::text, p_lang)))::int
  from public.topics t
    join public.subjects s on s.id = t.subject_id
    left join public.questions q on q.topic_id = t.id and q.status = 'published'
  where t.grade = p_grade and not t.archived
  group by t.id, t.subject_id
$$;

revoke execute on function public.question_ready_in(uuid, text), public.topic_min_questions(),
  public.topic_counts(smallint, text) from public;
grant execute on function public.question_ready_in(uuid, text), public.topic_min_questions(),
  public.topic_counts(smallint, text) to authenticated;
