-- Экран «Пайдаланушылар» (DECISIONS.md №90).
--
-- 1. admin_users: ещё школа (id и регион — для формы «Деректерін өзгерту»), классы и предметы учителя,
--    его вопросы (всего / на проверке / опубликовано); поиск и по названию школы; фильтр по школе.
-- 2. admin_user_stats — числа для плиток: учителя, ученики (+ за 7 дней), вопросы на проверке, заблокированные;
--    и школы, в которых есть пользователи, — для фильтра по школе.
-- 3. admin_update_user — админ меняет имя, школу, классы и предметы учителя, класс ученика.
-- Флаг «почта подключена» (signup.mail) хранится в app_settings вместе с переключателями регистрации — без миграции.

-- ---------- 1. Список пользователей ----------

drop function public.admin_users(text, public.app_role, boolean, int);

create function public.admin_users(p_search text default null, p_role public.app_role default null,
  p_blocked boolean default null, p_school uuid default null, p_limit int default 200)
returns table (id uuid, email text, role public.app_role, nickname text, first_name text, last_name text,
  school_id uuid, school_region uuid, school_kk text, school_ru text, school_other text, grade smallint,
  subjects uuid[], grades smallint[], q_total int, q_review int, q_published int,
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
         p.school_other, st.grade, ti.subjects, ti.grades,
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

-- ---------- 2. Плитки и список школ для фильтра ----------

create function public.admin_user_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  week timestamptz := now() - interval '7 days';
begin
  if not public.is_admin() then
    raise exception 'Только для админа' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'teachers', (select count(*) from public.profiles where role = 'teacher'),
    'teachers_week', (select count(*) from public.profiles where role = 'teacher' and created_at >= week),
    'students', (select count(*) from public.profiles where role = 'student'),
    'students_week', (select count(*) from public.profiles where role = 'student' and created_at >= week),
    'review', (select count(*) from public.questions where status = 'review'),
    'blocked', (select count(*) from public.profiles where blocked_at is not null),
    'schools', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name_kk', s.name_kk, 'name_ru', s.name_ru) order by s.name_ru)
        from public.schools s where exists (select 1 from public.profiles p where p.school_id = s.id)), '[]'));
end $$;

-- ---------- 3. «Деректерін өзгерту» ----------
-- p_data: first_name, last_name, school_id или school_other; учителю — subjects и grades; ученику — grade.
-- Ник и email здесь не меняются: email — адрес входа, ученик меняет ник сам в кабинете /me.

create function public.admin_update_user(p_user uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_role public.app_role;
  v_first text := trim(coalesce(p_data ->> 'first_name', ''));
  v_last text := trim(coalesce(p_data ->> 'last_name', ''));
  v_other text := nullif(trim(coalesce(p_data ->> 'school_other', '')), '');
  v_school uuid;
  v_subjects uuid[];
  v_grades smallint[];
begin
  if not public.is_admin() then
    raise exception 'Только админ' using errcode = '42501';
  end if;
  select role into v_role from public.profiles where id = p_user;
  if v_role is null then
    raise exception 'Пользователь не найден' using errcode = 'check_violation';
  end if;
  if length(v_first) > 60 or length(v_last) > 60 or (v_role = 'teacher' and (v_first = '' or v_last = '')) then
    raise exception 'Не указано имя или фамилия' using errcode = 'check_violation';
  end if;
  if nullif(p_data ->> 'school_id', '') is not null then
    select id into v_school from public.schools where id::text = p_data ->> 'school_id' and approved;
    if v_school is null then
      raise exception 'Школа не найдена' using errcode = 'check_violation';
    end if;
  elsif v_role = 'teacher' and v_other is null then
    raise exception 'Не указана школа' using errcode = 'check_violation';
  end if;

  if v_role = 'teacher' then
    select coalesce(array_agg(s.id), '{}') into v_subjects from public.subjects s
     where s.id::text in (select jsonb_array_elements_text(coalesce(p_data -> 'subjects', '[]')));
    select coalesce(array_agg(distinct g::smallint order by g::smallint), '{}') into v_grades
      from jsonb_array_elements_text(coalesce(p_data -> 'grades', '[]')) g;
    if cardinality(v_subjects) = 0 or cardinality(v_grades) = 0 then
      raise exception 'Не указаны предметы или классы' using errcode = 'check_violation';
    end if;
    insert into public.teacher_info (user_id, subjects, grades) values (p_user, v_subjects, v_grades)
    on conflict (user_id) do update set subjects = excluded.subjects, grades = excluded.grades;
  elsif v_role = 'student' and p_data ? 'grade' then
    update school.students set grade = (p_data ->> 'grade')::smallint where user_id = p_user;
  end if;

  update public.profiles set first_name = v_first, last_name = v_last, full_name = trim(v_first || ' ' || v_last),
    school_id = v_school, school_other = case when v_school is null then v_other end
  where id = p_user;
end $$;

-- ---------- Права ----------

revoke execute on function public.admin_users(text, public.app_role, boolean, uuid, int), public.admin_user_stats(),
  public.admin_update_user(uuid, jsonb) from public, anon;
grant execute on function public.admin_users(text, public.app_role, boolean, uuid, int), public.admin_user_stats(),
  public.admin_update_user(uuid, jsonb) to authenticated;
