-- Результаты в аккаунте ученика (DECISIONS.md №72, №104).
-- my_progress() — для вошедшего ученика:
--   answers: последний ответ на каждый вопрос { id вопроса: [id темы, верно] } — тренажёр на любом устройстве;
--   runs: последние 30 тестов с предметом и темой — история в кабинете /me.
-- Не ученик или не вошёл — пустые списки.

create function public.my_progress() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when public.my_role() is distinct from 'student' then jsonb_build_object('answers', '{}'::jsonb, 'runs', '[]'::jsonb)
  else jsonb_build_object(
    'answers', coalesce((
      select jsonb_object_agg(a.question_id, jsonb_build_array(a.topic_id, a.is_correct))
        from (select distinct on (question_id) question_id, topic_id, is_correct
                from school.answers where student_id = auth.uid() order by question_id, answered_at desc) a), '{}'),
    'runs', coalesce((
      select jsonb_agg(jsonb_build_object('subject_id', r.subject_id, 'grade', r.grade, 'topic_id', r.topic_id,
        'score', r.score, 'total', r.total, 'finished_at', r.finished_at,
        'subject_kk', s.name_kk, 'subject_ru', s.name_ru, 'subject_en', s.name_en, 'icon', s.icon,
        'topic_kk', t.title_kk, 'topic_ru', t.title_ru, 'topic_en', t.title_en) order by r.finished_at desc)
      from (select * from school.test_runs where student_id = auth.uid() order by finished_at desc limit 30) r
        left join public.subjects s on s.id = r.subject_id
        left join public.topics t on t.id = r.topic_id), '[]'))
  end
$$;

revoke execute on function public.my_progress() from public, anon;
grant execute on function public.my_progress() to authenticated;
