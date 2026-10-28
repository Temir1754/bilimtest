-- «Сенімді мұғалім» — доверенный учитель (DECISIONS.md №94). Уточняет №4 и №47.
--
-- 1. teacher_info.trusted — ставит и снимает только админ (admin_set_trusted).
-- 2. Доверенный учитель публикует свои вопросы сам и правит свои опубликованные (как админ, но только свои).
--    Удалить опубликованный по-прежнему может только админ. Проверки «3–4 варианта, один правильный,
--    полный текст» делает база (assert_question_publishable) — вопрос с ошибкой не опубликовать никому.
-- 3. publish_ready(ids) — публикует из списка вопросы без ошибок, остальные оставляет как есть.
--    Админ — любые, доверенный учитель — только свои. Возвращает число опубликованных.
-- 4. import_questions(…, p_publish): при p_publish = true у админа и доверенного учителя вызывает publish_ready
--    для загруженных вопросов. Ответ: questions, topics, published.
-- 5. admin_users отдаёт trusted — для пометки в списке «Пайдаланушылар».

alter table public.teacher_info add column trusted boolean not null default false;

create function public.is_trusted() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role() = 'teacher' and (
    select trusted from public.teacher_info where user_id = auth.uid()), false)
$$;

-- ---------- 2. Права на вопросы ----------

create or replace function public.can_edit_question(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or (
    public.my_role() = 'teacher' and exists (
      select 1 from public.questions q
      where q.id = p_id and q.author_id = auth.uid() and (q.status in ('draft', 'review') or public.is_trusted())))
$$;

drop policy "вопросы: учитель создаёт черновик" on public.questions;
drop policy "вопросы: учитель правит свои черновики" on public.questions;
create policy "вопросы: учитель создаёт черновик" on public.questions for insert to authenticated
  with check ((select public.is_admin()) or (
    (select public.my_role()) = 'teacher' and author_id = (select auth.uid())
    and (status in ('draft', 'review') or (select public.is_trusted()))));
create policy "вопросы: учитель правит свои черновики" on public.questions for update to authenticated
  using ((select public.is_admin()) or (
    (select public.my_role()) = 'teacher' and author_id = (select auth.uid())
    and (status in ('draft', 'review') or (select public.is_trusted()))))
  with check ((select public.is_admin()) or (
    (select public.my_role()) = 'teacher' and author_id = (select auth.uid())
    and (status in ('draft', 'review') or (select public.is_trusted()))));

-- ---------- 1. Метку ставит админ ----------

create function public.admin_set_trusted(p_user uuid, p_trusted boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Только админ' using errcode = '42501';
  end if;
  if (select role from public.profiles where id = p_user) is distinct from 'teacher' then
    raise exception 'Доверенным бывает только учитель' using errcode = 'check_violation';
  end if;
  insert into public.teacher_info (user_id, trusted) values (p_user, p_trusted)
  on conflict (user_id) do update set trusted = excluded.trusted;
end $$;

-- ---------- 3. Опубликовать готовые ----------

create function public.publish_ready(p_ids uuid[]) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  n int := 0;
begin
  if not (public.is_admin() or public.is_trusted()) then
    raise exception 'Публикует админ или доверенный учитель' using errcode = '42501';
  end if;
  for v_id in
    select id from public.questions
     where id = any(p_ids) and status <> 'published' and teacher_check is null
       and (public.is_admin() or author_id = auth.uid())
  loop
    -- Вопрос с ошибкой откатывается к прежнему статусу, остальные публикуются.
    begin
      update public.questions set status = 'published', review_comment = null where id = v_id;
      perform public.assert_question_publishable(v_id);
      n := n + 1;
    exception when check_violation then
      null;
    end;
  end loop;
  return n;
end $$;

-- ---------- 4. Загрузка из файла с публикацией ----------

drop function public.import_questions(uuid, int, jsonb);

create function public.import_questions(p_subject_id uuid, p_grade int, p_rows jsonb, p_publish boolean default false)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  r jsonb;
  v_title text;
  v_topic uuid;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_questions int := 0;
  v_topics int := 0;
  v_section uuid;
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
        -- section_id — раздел, выбранный в таблице-предпросмотре (должен быть в этом предмете и классе).
        v_section := null;
        if nullif(r ->> 'section_id', '') is not null then
          select id into v_section from public.sections
           where id::text = r ->> 'section_id' and subject_id = p_subject_id and grade = p_grade;
          if v_section is null then
            raise exception 'Раздел не найден в этом предмете и классе' using errcode = 'check_violation';
          end if;
        end if;
        insert into public.topics (subject_id, grade, section_id, title_kk, title_ru, title_en, sort_order)
        values (p_subject_id, p_grade, v_section, v_title, v_title, v_title, coalesce(
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

    v_ids := v_ids || v_id;
    v_questions := v_questions + 1;
  end loop;

  return jsonb_build_object('questions', v_questions, 'topics', v_topics,
    'published', case when p_publish and (public.is_admin() or public.is_trusted())
                      then public.publish_ready(v_ids) else 0 end);
end $$;

-- ---------- 5. Список пользователей с пометкой trusted ----------

drop function public.admin_users(text, public.app_role, boolean, uuid, int);

create function public.admin_users(p_search text default null, p_role public.app_role default null,
  p_blocked boolean default null, p_school uuid default null, p_limit int default 200)
returns table (id uuid, email text, role public.app_role, nickname text, first_name text, last_name text,
  school_id uuid, school_region uuid, school_kk text, school_ru text, school_other text, grade smallint,
  subjects uuid[], grades smallint[], trusted boolean, q_total int, q_review int, q_published int,
  blocked_at timestamptz, must_change_password boolean, created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  q text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Только для админа' using errcode = '42501';
  end if;
  return query
  select p.id, u.email::text, p.role, p.nickname, p.first_name, p.last_name, p.school_id, s.region_id, s.name_kk, s.name_ru,
         p.school_other, st.grade, ti.subjects, ti.grades, coalesce(ti.trusted, false),
         coalesce(n.total, 0), coalesce(n.review, 0), coalesce(n.published, 0),
         p.blocked_at, p.must_change_password, p.created_at, u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.schools s on s.id = p.school_id
    left join school.students st on st.user_id = p.id
    left join public.teacher_info ti on ti.user_id = p.id
    left join lateral (
      select count(*)::int as total, (count(*) filter (where x.status = 'review'))::int as review,
             (count(*) filter (where x.status = 'published'))::int as published
        from public.questions x where x.author_id = p.id
    ) n on p.role <> 'student'
   where (p_role is null or p.role = p_role)
     and (p_blocked is null or (p.blocked_at is not null) = p_blocked)
     and (p_school is null or p.school_id = p_school)
     and (q is null or concat_ws(' ', u.email, p.nickname, p.first_name, p.last_name, p.full_name,
                                 s.name_kk, s.name_ru, p.school_other) ilike '%' || q || '%')
   order by p.created_at desc
   limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end $$;

-- ---------- Права ----------

revoke execute on function public.is_trusted(), public.admin_set_trusted(uuid, boolean), public.publish_ready(uuid[]),
  public.import_questions(uuid, int, jsonb, boolean), public.admin_users(text, public.app_role, boolean, uuid, int)
  from public, anon;
grant execute on function public.is_trusted(), public.admin_set_trusted(uuid, boolean), public.publish_ready(uuid[]),
  public.import_questions(uuid, int, jsonb, boolean), public.admin_users(text, public.app_role, boolean, uuid, int)
  to authenticated;
