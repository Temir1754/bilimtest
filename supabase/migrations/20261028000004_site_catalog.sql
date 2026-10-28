-- Сайт ученика на базе (этап 4, DECISIONS.md №48, №49, №67, №88, №97).
--
-- 1. site_catalog() — всё для главной и списка тем одним запросом: предметы, разделы, темы
--    с числом готовых вопросов на каждом языке (kk, ru, en) и порог topic_min_questions.
--    Только темы, где хотя бы на одном языке готовых вопросов не меньше порога; скрытые — нет.
--    У языкового предмета число одно и то же на всех языках (вопросы на языке предмета).
-- 2. site_questions(темы, язык) — опубликованные вопросы этих тем, полные на языке (у языкового
--    предмета — на его языке), с вариантами. id вариантов нужны для submit_attempt.
-- Обе функции доступны анониму: отдают только опубликованное.

create function public.site_catalog() returns jsonb
language sql stable security definer set search_path = '' as $$
  with min as (select public.topic_min_questions() as n),
  counts as (
    select t.id, t.subject_id, t.grade, t.section_id, t.title_kk, t.title_ru, t.title_en, t.sort_order,
      count(q.id) filter (where public.question_ready_in(q.id, coalesce(s.only_lang::text, 'kk')))::int as kk,
      count(q.id) filter (where public.question_ready_in(q.id, coalesce(s.only_lang::text, 'ru')))::int as ru,
      count(q.id) filter (where public.question_ready_in(q.id, coalesce(s.only_lang::text, 'en')))::int as en
    from public.topics t
      join public.subjects s on s.id = t.subject_id
      join public.questions q on q.topic_id = t.id and q.status = 'published'
    where not t.archived
    group by t.id
  ),
  shown as (select c.* from counts c, min where greatest(c.kk, c.ru, c.en) >= min.n)
  select jsonb_build_object(
    'min', (select n from min),
    'subjects', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'slug', s.slug, 'icon', s.icon, 'name_kk', s.name_kk,
        'name_ru', s.name_ru, 'name_en', s.name_en, 'only_lang', s.only_lang, 'sort_order', s.sort_order)
        order by s.sort_order)
      from public.subjects s where exists (select 1 from shown where shown.subject_id = s.id)), '[]'),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'subject_id', x.subject_id, 'grade', x.grade,
        'title_kk', x.title_kk, 'title_ru', x.title_ru, 'title_en', x.title_en, 'sort_order', x.sort_order)
        order by x.sort_order)
      from public.sections x where exists (select 1 from shown where shown.section_id = x.id)), '[]'),
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'subject_id', c.subject_id, 'grade', c.grade,
        'section_id', c.section_id, 'title_kk', c.title_kk, 'title_ru', c.title_ru, 'title_en', c.title_en,
        'sort_order', c.sort_order, 'kk', c.kk, 'ru', c.ru, 'en', c.en) order by c.sort_order)
      from shown c), '[]'))
$$;

create function public.site_questions(p_topic_ids uuid[], p_lang text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if cardinality(p_topic_ids) not between 1 and 200 or p_lang not in ('kk', 'ru', 'en') then
    raise exception 'Нужно от 1 до 200 тем и язык kk, ru или en' using errcode = 'check_violation';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', q.id, 'topic_id', q.topic_id, 'text_kk', q.text_kk, 'text_ru', q.text_ru,
      'text_en', q.text_en, 'explanation_kk', q.explanation_kk, 'explanation_ru', q.explanation_ru,
      'explanation_en', q.explanation_en, 'image_url', q.image_url,
      'options', (select jsonb_agg(jsonb_build_object('id', o.id, 'text_kk', o.text_kk, 'text_ru', o.text_ru,
        'text_en', o.text_en, 'is_correct', o.is_correct) order by o.sort_order)
        from public.options o where o.question_id = q.id))
      order by t.sort_order, q.sort_order)
    from public.questions q
      join public.topics t on t.id = q.topic_id and not t.archived
      join public.subjects s on s.id = t.subject_id
    where q.topic_id = any(p_topic_ids) and q.status = 'published'
      and public.question_ready_in(q.id, coalesce(s.only_lang::text, p_lang))), '[]');
end $$;

revoke execute on function public.site_catalog(), public.site_questions(uuid[], text) from public;
grant execute on function public.site_catalog(), public.site_questions(uuid[], text) to anon, authenticated;
