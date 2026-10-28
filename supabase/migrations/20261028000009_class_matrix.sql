-- Кабинет учителя: «ученики × темы» и страница ученика (DECISIONS.md №58–62, №64, №107; docs/stage8-schema.md).
--
-- Уровень по теме — по последним 20 ответам ученика на тему (level_window): процент верных.
-- Меньше 5 ответов (level_min_answers) — «мало данных». Цвет (80 / 50) выбирает экран; числа — здесь.
-- Учитель видит только учеников своего класса и только ответы по предмету класса (№61); темы других классов —
-- с номером класса темы (№64).
--
-- 1. class_matrix(класс) — ученики, темы и клетки { ученик, тема, ответов (до 20), процент }; неактивные > 7 дней.
-- 2. student_report(класс, ученик) — тесты, средний %, по неделям, уровни по темам, вопросы с ошибками.

create function public.class_matrix(p_class_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c school.classes;
begin
  select * into c from school.classes where id = p_class_id and (teacher_id = auth.uid() or public.is_admin());
  if c.id is null then
    raise exception 'Класс не найден' using errcode = 'check_violation';
  end if;
  return (
    with members as (
      select m.student_id, coalesce(nullif(m.display_name, ''), p.nickname) as name
        from school.class_members m join public.profiles p on p.id = m.student_id where m.class_id = c.id
    ),
    last20 as (
      select a.student_id, a.topic_id, a.is_correct,
             row_number() over (partition by a.student_id, a.topic_id order by a.answered_at desc) as k
        from school.answers a join members m on m.student_id = a.student_id
       where a.subject_id = c.subject_id
    ),
    cells as (
      select student_id, topic_id, count(*)::int as n, round(100.0 * count(*) filter (where is_correct) / count(*))::int as pct
        from last20 where k <= 20 group by student_id, topic_id
    ),
    last_run as (
      select r.student_id, max(r.finished_at) as at from school.test_runs r join members m on m.student_id = r.student_id
       where r.subject_id = c.subject_id group by r.student_id
    )
    select jsonb_build_object(
      'min_answers', 5,
      'students', coalesce((select jsonb_agg(jsonb_build_object('id', m.student_id, 'name', m.name, 'last_at', l.at,
          'inactive', l.at is null or l.at < now() - interval '7 days') order by m.name)
        from members m left join last_run l on l.student_id = m.student_id), '[]'),
      'topics', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'grade', t.grade, 'title_kk', t.title_kk,
          'title_ru', t.title_ru, 'title_en', t.title_en) order by t.grade <> c.grade, t.grade, t.sort_order)
        from public.topics t where t.id in (select topic_id from cells)), '[]'),
      'cells', coalesce((select jsonb_agg(jsonb_build_object('s', student_id, 't', topic_id, 'n', n, 'pct', pct)) from cells), '[]'))
  );
end $$;

create function public.student_report(p_class_id uuid, p_student_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c school.classes;
  v_name text;
begin
  select * into c from school.classes where id = p_class_id and (teacher_id = auth.uid() or public.is_admin());
  select coalesce(nullif(m.display_name, ''), p.nickname) into v_name
    from school.class_members m join public.profiles p on p.id = m.student_id
   where m.class_id = c.id and m.student_id = p_student_id;
  if c.id is null or v_name is null then
    raise exception 'Ученик не найден' using errcode = 'check_violation';
  end if;
  return jsonb_build_object(
    'name', v_name,
    'runs', (select count(*) from school.test_runs where student_id = p_student_id and subject_id = c.subject_id),
    'percent', (select round(100.0 * sum(score) / nullif(sum(total), 0))::int
                  from school.test_runs where student_id = p_student_id and subject_id = c.subject_id),
    -- По неделям (с понедельника, время Алматы): последние 8 недель с тестами.
    'weeks', coalesce((select jsonb_agg(w order by w ->> 'week') from (
        select jsonb_build_object('week', to_char(date_trunc('week', finished_at at time zone 'Asia/Almaty'), 'YYYY-MM-DD'),
          'tests', count(*), 'percent', round(100.0 * sum(score) / nullif(sum(total), 0))::int) as w
          from school.test_runs where student_id = p_student_id and subject_id = c.subject_id
           and finished_at > now() - interval '8 weeks'
         group by date_trunc('week', finished_at at time zone 'Asia/Almaty')) x), '[]'),
    'topics', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'grade', t.grade, 'title_kk', t.title_kk,
        'title_ru', t.title_ru, 'title_en', t.title_en, 'n', x.n, 'pct', x.pct) order by x.pct, x.n desc) from (
        select topic_id, count(*)::int as n, round(100.0 * count(*) filter (where is_correct) / count(*))::int as pct from (
          select topic_id, is_correct, row_number() over (partition by topic_id order by answered_at desc) as k
            from school.answers where student_id = p_student_id and subject_id = c.subject_id) a
         where k <= 20 group by topic_id) x join public.topics t on t.id = x.topic_id), '[]'),
    -- Вопросы, где последний ответ неверный; сверху — где ошибок больше всего.
    'wrong', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'text_kk', q.text_kk, 'text_ru', q.text_ru,
        'text_en', q.text_en, 'times', w.times) order by w.times desc, w.last_at desc) from (
        select question_id, count(*) filter (where not is_correct)::int as times, max(answered_at) as last_at,
               (array_agg(is_correct order by answered_at desc))[1] as last_ok
          from school.answers where student_id = p_student_id and subject_id = c.subject_id group by question_id) w
        join public.questions q on q.id = w.question_id
       where not w.last_ok
       limit 30), '[]'));
end $$;

revoke execute on function public.class_matrix(uuid), public.student_report(uuid, uuid) from public, anon;
grant execute on function public.class_matrix(uuid), public.student_report(uuid, uuid) to authenticated;
