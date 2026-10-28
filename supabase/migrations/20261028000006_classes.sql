-- Кабинет учителя, первая версия (DECISIONS.md №42–45, №57–64, №102; схема — docs/stage8-schema.md).
--
-- Данные учеников — в схеме school (№45): на вопросы и предметы ссылаются только id, без внешних ключей.
-- Таблицы school не открыты браузеру напрямую: вся работа — функциями public.* (security definer) с проверкой прав.
--
-- 1. school.classes — класс учителя по одному предмету (№63), код из 6 символов для учеников.
-- 2. school.class_members — ученик в классе; имя в классе («Айгерім С.») — по желанию ученика.
-- 3. school.test_runs и school.answers — тесты вошедшего ученика: пишет submit_attempt (правильность считает база).
-- 4. Функции: create_class, delete_class, my_classes, join_class, leave_class, class_report, remove_member.
--    В отчёт учителя идут тесты ученика только по предмету класса (№61), из любого класса (№64).

create table school.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid not null, -- public.subjects.id, без внешнего ключа (№45)
  grade smallint not null check (grade between 4 and 11),
  letter text not null default '' check (length(letter) <= 10),
  join_code text not null unique check (join_code ~ '^[A-Z2-9]{6}$'),
  created_at timestamptz not null default now()
);
create index classes_teacher on school.classes (teacher_id);

create table school.class_members (
  class_id uuid not null references school.classes (id) on delete cascade,
  student_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null default '' check (length(display_name) <= 60),
  joined_at timestamptz not null default now(),
  primary key (class_id, student_id)
);
create index class_members_student on school.class_members (student_id);

create table school.test_runs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid not null,
  grade smallint not null,
  topic_id uuid, -- пусто — смешанный тест или работа над ошибками
  score int not null,
  total int not null,
  finished_at timestamptz not null default now()
);
create index test_runs_student on school.test_runs (student_id, subject_id, finished_at desc);

create table school.answers (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references school.test_runs (id) on delete cascade,
  student_id uuid not null references auth.users (id) on delete cascade,
  question_id uuid not null,
  topic_id uuid not null,
  subject_id uuid not null,
  option_id uuid,
  is_correct boolean not null,
  answered_at timestamptz not null default now()
);
create index answers_student on school.answers (student_id, subject_id, topic_id, answered_at desc);

-- Браузеру — ничего напрямую: только функции ниже. RLS включён на случай будущих прямых прав.
revoke all on school.classes, school.class_members, school.test_runs, school.answers from public, anon, authenticated;
alter table school.classes enable row level security;
alter table school.class_members enable row level security;
alter table school.test_runs enable row level security;
alter table school.answers enable row level security;

-- ---------- Учитель: классы ----------

create function public.create_class(p_subject_id uuid, p_grade int, p_letter text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
  v_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Класс создаёт учитель' using errcode = '42501';
  end if;
  if not exists (select 1 from public.subjects where id = p_subject_id) or p_grade not between 4 and 11 then
    raise exception 'Нет такого предмета или класса' using errcode = 'check_violation';
  end if;
  -- Код без похожих символов (0/O, 1/I): ученик переписывает его с доски.
  loop
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
      into v_code from generate_series(1, 6);
    exit when not exists (select 1 from school.classes where join_code = v_code);
  end loop;
  insert into school.classes (teacher_id, subject_id, grade, letter, join_code)
  values (auth.uid(), p_subject_id, p_grade, upper(trim(coalesce(p_letter, ''))), v_code)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'join_code', v_code);
end $$;

create function public.delete_class(p_class_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from school.classes where id = p_class_id and (teacher_id = auth.uid() or public.is_admin());
  if not found then
    raise exception 'Класс не найден' using errcode = 'check_violation';
  end if;
end $$;

-- Учитель — свои классы с числом учеников; ученик — классы, где он состоит (с именем учителя).
create function public.my_classes() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by (x ->> 'grade')::int, x ->> 'letter'), '[]') from (
    select jsonb_build_object('id', c.id, 'subject_id', c.subject_id, 'grade', c.grade, 'letter', c.letter,
      'join_code', c.join_code, 'students', (select count(*) from school.class_members m where m.class_id = c.id)) as x
    from school.classes c where c.teacher_id = auth.uid() and public.is_staff()
    union all
    select jsonb_build_object('id', c.id, 'subject_id', c.subject_id, 'grade', c.grade, 'letter', c.letter,
      'teacher', trim(p.first_name || ' ' || left(p.last_name, 1) || case when p.last_name <> '' then '.' else '' end),
      'display_name', m.display_name)
    from school.class_members m join school.classes c on c.id = m.class_id join public.profiles p on p.id = c.teacher_id
    where m.student_id = auth.uid()
  ) s
$$;

-- ---------- Ученик: вступить и выйти ----------

create function public.join_class(p_code text, p_name text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c school.classes;
begin
  if public.my_role() is distinct from 'student' then
    raise exception 'В класс вступает ученик' using errcode = '42501';
  end if;
  if not public.hit_rate_limit('join_class', 30, interval '1 hour') then
    raise exception 'Слишком много попыток, попробуйте позже' using errcode = 'check_violation';
  end if;
  select * into c from school.classes where join_code = upper(trim(coalesce(p_code, '')));
  if c.id is null then
    raise exception 'Код класса не найден' using errcode = 'check_violation';
  end if;
  insert into school.class_members (class_id, student_id, display_name)
  values (c.id, auth.uid(), left(trim(coalesce(p_name, '')), 60))
  on conflict (class_id, student_id) do update set display_name = excluded.display_name;
  return jsonb_build_object('id', c.id, 'subject_id', c.subject_id, 'grade', c.grade, 'letter', c.letter);
end $$;

create function public.leave_class(p_class_id uuid) returns void
language sql security definer set search_path = '' as $$
  delete from school.class_members where class_id = p_class_id and student_id = auth.uid()
$$;

-- ---------- Учитель: отчёт по классу ----------
-- students: каждый ученик — тесты по предмету класса, средний процент, последний тест, ответы за 30 дней.
-- topics: темы, которые класс решал за 30 дней, — процент верных; трудные сверху.

create function public.class_report(p_class_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c school.classes;
begin
  select * into c from school.classes where id = p_class_id and (teacher_id = auth.uid() or public.is_admin());
  if c.id is null then
    raise exception 'Класс не найден' using errcode = 'check_violation';
  end if;
  return jsonb_build_object(
    'class', jsonb_build_object('id', c.id, 'subject_id', c.subject_id, 'grade', c.grade, 'letter', c.letter, 'join_code', c.join_code),
    'students', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.student_id, 'display_name', m.display_name, 'nickname', p.nickname,
        'runs', coalesce(r.runs, 0), 'percent', r.pct, 'last_at', r.last_at) order by r.last_at desc nulls last, m.display_name)
      from school.class_members m
        join public.profiles p on p.id = m.student_id
        left join lateral (
          select count(*)::int as runs, round(100.0 * sum(score) / nullif(sum(total), 0))::int as pct, max(finished_at) as last_at
            from school.test_runs where student_id = m.student_id and subject_id = c.subject_id) r on true
      where m.class_id = c.id), '[]'),
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object('topic_id', a.topic_id, 'grade', t.grade, 'title_kk', t.title_kk, 'title_ru', t.title_ru,
        'title_en', t.title_en, 'answers', a.n, 'students', a.people, 'percent', a.pct) order by a.pct, a.n desc)
      from (
        select topic_id, count(*)::int as n, count(distinct student_id)::int as people,
               round(100.0 * count(*) filter (where is_correct) / count(*))::int as pct
          from school.answers
         where subject_id = c.subject_id and answered_at > now() - interval '30 days'
           and student_id in (select student_id from school.class_members where class_id = c.id)
         group by topic_id
      ) a left join public.topics t on t.id = a.topic_id), '[]'));
end $$;

-- Учитель убирает ученика из класса вместе с его тестами по предмету класса (№61).
create function public.remove_member(p_class_id uuid, p_student_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_subject uuid;
begin
  select subject_id into v_subject from school.classes where id = p_class_id and (teacher_id = auth.uid() or public.is_admin());
  if v_subject is null then
    raise exception 'Класс не найден' using errcode = 'check_violation';
  end if;
  delete from school.class_members where class_id = p_class_id and student_id = p_student_id;
  if not found then
    raise exception 'Ученика нет в классе' using errcode = 'check_violation';
  end if;
  delete from school.test_runs where student_id = p_student_id and subject_id = v_subject;
  delete from school.answers where student_id = p_student_id and subject_id = v_subject;
end $$;

-- ---------- Результат теста: вошедший ученик — ещё и в school ----------

create or replace function public.submit_attempt(p_subject_id uuid, p_grade int, p_topic_id uuid, p_answers jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_total int;
  v_score int;
  v_id uuid;
  v_run uuid;
begin
  if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers) not between 1 and 50 then
    return jsonb_build_object('ok', false, 'reason', 'bad_input');
  end if;
  if not public.hit_rate_limit('attempt', public.setting_int('attempts_per_hour', 600), interval '1 hour') then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  -- Учитываются только опубликованные вопросы, каждый один раз; вариант должен принадлежать вопросу.
  create temp table if not exists pg_temp.checked (qid uuid, oid uuid, topic_id uuid, ok boolean) on commit drop;
  truncate pg_temp.checked;
  insert into pg_temp.checked
  select distinct on (a.qid) a.qid, o.id, q.topic_id, coalesce(o.is_correct, false)
  from (
    select (x ->> 'question_id')::uuid as qid, nullif(x ->> 'option_id', '')::uuid as oid
    from jsonb_array_elements(p_answers) x
  ) a
  join public.questions q on q.id = a.qid and q.status = 'published'
  left join public.options o on o.id = a.oid and o.question_id = a.qid;

  select count(*), count(*) filter (where ok) into v_total, v_score from pg_temp.checked;
  if v_total = 0 then
    return jsonb_build_object('ok', false, 'reason', 'bad_input');
  end if;

  insert into public.answer_stats as s (question_id, shown_count, correct_count)
  select qid, 1, ok::int from pg_temp.checked
  on conflict (question_id) do update
    set shown_count = s.shown_count + 1, correct_count = s.correct_count + excluded.correct_count;

  insert into public.attempts (user_id, subject_id, grade, topic_id, score, total)
  values (auth.uid(), p_subject_id, p_grade, p_topic_id, v_score, v_total)
  returning id into v_id;

  -- Вошедший ученик: тест и ответы — в его данные (отчёт учителя, кабинет /me).
  if public.my_role() = 'student' then
    insert into school.test_runs (student_id, subject_id, grade, topic_id, score, total)
    values (auth.uid(), p_subject_id, p_grade, p_topic_id, v_score, v_total)
    returning id into v_run;
    insert into school.answers (run_id, student_id, question_id, topic_id, subject_id, option_id, is_correct)
    select v_run, auth.uid(), qid, topic_id, p_subject_id, oid, ok from pg_temp.checked;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'score', v_score, 'total', v_total);
exception when invalid_text_representation or foreign_key_violation or check_violation then
  return jsonb_build_object('ok', false, 'reason', 'bad_input');
end $$;

revoke execute on function public.create_class(uuid, int, text), public.delete_class(uuid), public.my_classes(),
  public.join_class(text, text), public.leave_class(uuid), public.class_report(uuid), public.remove_member(uuid, uuid)
  from public, anon;
grant execute on function public.create_class(uuid, int, text), public.delete_class(uuid), public.my_classes(),
  public.join_class(text, text), public.leave_class(uuid), public.class_report(uuid), public.remove_member(uuid, uuid)
  to authenticated;
