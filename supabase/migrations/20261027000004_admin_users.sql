-- Білімтест: экран «Пользователи» и пилот (DECISIONS.md №79–83).
--
-- Учителя: аккаунт создаёт функция на сервере admin-users (Edge Function, ключ сервера) — сначала простой
-- подтверждённый аккаунт (путь 2 в handle_new_user), затем setup_teacher заполняет анкету. Временный пароль нужно
-- сменить при первом входе (must_change_password); после смены пароля флаг снимает password_changed.
-- Ученики в пилоте: упрощённая регистрация через функцию на сервере student-signup — ник, пароль, класс, согласие;
-- имя необязательно (№83). Лимит частоты по IP — signup_rate_ok.

alter table public.profiles add column must_change_password boolean not null default false;

-- ---------- Список пользователей для админа ----------
-- email и последний вход лежат в auth.users — через API их не видно, поэтому отдельная функция только для админа.

create function public.admin_users(p_search text default null, p_role public.app_role default null,
  p_blocked boolean default null, p_limit int default 200)
returns table (id uuid, email text, role public.app_role, nickname text, first_name text, last_name text,
  school_kk text, school_ru text, school_other text, grade smallint, blocked_at timestamptz,
  must_change_password boolean, created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  q text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Только для админа' using errcode = '42501';
  end if;
  return query
  select p.id, u.email::text, p.role, p.nickname, p.first_name, p.last_name, s.name_kk, s.name_ru, p.school_other,
         st.grade, p.blocked_at, p.must_change_password, p.created_at, u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.schools s on s.id = p.school_id
    left join school.students st on st.user_id = p.id
   where (p_role is null or p.role = p_role)
     and (p_blocked is null or (p.blocked_at is not null) = p_blocked)
     and (q is null or concat_ws(' ', u.email, p.nickname, p.first_name, p.last_name, p.full_name) ilike '%' || q || '%')
   order by p.created_at desc
   limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end $$;

-- ---------- Анкета учителя, созданного админом ----------
-- p_data: nickname, first_name, last_name, school_id или school_other, subjects (id), grades.
-- Вызывает только функция на сервере admin-users сразу после создания аккаунта.

create function public.setup_teacher(p_user uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_nick text := lower(trim(coalesce(p_data ->> 'nickname', '')));
  v_first text := trim(coalesce(p_data ->> 'first_name', ''));
  v_last text := trim(coalesce(p_data ->> 'last_name', ''));
  v_other text := nullif(trim(coalesce(p_data ->> 'school_other', '')), '');
  v_school uuid;
  v_subjects uuid[];
  v_grades smallint[];
begin
  if (select role from public.profiles where id = p_user) is distinct from 'student'
     or (select nickname from public.profiles where id = p_user) is not null then
    raise exception 'Аккаунт уже настроен' using errcode = 'check_violation';
  end if;
  if (select lower(email) from auth.users where id = p_user) like '%@students.bilimtest.local' then
    raise exception 'Адрес входа не подходит для роли' using errcode = 'check_violation';
  end if;
  if v_nick !~ '^[a-z0-9_.]{3,20}$' then
    raise exception 'Неверный никнейм' using errcode = 'check_violation';
  end if;
  if v_first = '' or v_last = '' or length(v_first) > 60 or length(v_last) > 60 then
    raise exception 'Не указано имя или фамилия' using errcode = 'check_violation';
  end if;
  if nullif(p_data ->> 'school_id', '') is not null then
    select id into v_school from public.schools where id::text = p_data ->> 'school_id' and approved;
    if v_school is null then
      raise exception 'Школа не найдена' using errcode = 'check_violation';
    end if;
  elsif v_other is null then
    raise exception 'Не указана школа' using errcode = 'check_violation';
  end if;
  select coalesce(array_agg(s.id), '{}') into v_subjects from public.subjects s
   where s.id::text in (select jsonb_array_elements_text(coalesce(p_data -> 'subjects', '[]')));
  select coalesce(array_agg(distinct g::smallint), '{}') into v_grades
    from jsonb_array_elements_text(coalesce(p_data -> 'grades', '[]')) g;
  if cardinality(v_subjects) = 0 or cardinality(v_grades) = 0 then
    raise exception 'Не указаны предметы или классы' using errcode = 'check_violation';
  end if;

  update public.profiles set role = 'teacher', nickname = v_nick, first_name = v_first, last_name = v_last,
    full_name = v_first || ' ' || v_last, school_id = v_school, school_other = case when v_school is null then v_other end,
    must_change_password = true
  where id = p_user;
  insert into public.teacher_info (user_id, subjects, grades) values (p_user, v_subjects, v_grades);
end $$;

-- После смены временного пароля: снять флаг у себя.
create function public.password_changed() returns void
language sql security definer set search_path = '' as $$
  update public.profiles set must_change_password = false where id = auth.uid()
$$;

-- ---------- Пилот: упрощённая регистрация ученика (№83) ----------

update public.app_settings set value = value || '{"student_signups_per_hour": 60}' where key = 'limits';

-- Как в миграции accounts, но имя обязательно только учителю: ученик в пилоте его не указывает.
create or replace function public.check_signup(p_role public.app_role, m jsonb, p_email text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_nick text := lower(trim(coalesce(m ->> 'nickname', '')));
  v_first text := trim(coalesce(m ->> 'first_name', ''));
  v_last text := trim(coalesce(m ->> 'last_name', ''));
  v_school uuid;
begin
  if coalesce(m ->> 'website', '') <> '' then -- поле-ловушка
    raise exception 'Регистрация отклонена' using errcode = '42501';
  end if;
  if not coalesce((public.signup_open() ->> p_role::text)::boolean, false) then
    raise exception 'Регистрация закрыта' using errcode = '42501';
  end if;
  if coalesce((m ->> 'consent')::boolean, false) is not true then
    raise exception 'Нужно согласие с политикой конфиденциальности' using errcode = 'check_violation';
  end if;
  if v_nick !~ '^[a-z0-9_.]{3,20}$' then
    raise exception 'Неверный никнейм' using errcode = 'check_violation';
  end if;
  -- Ученик входит по нику: адрес входа — ник@students.bilimtest.local (№71). Учителю такой адрес нельзя.
  if (p_role = 'student') <> (lower(p_email) = v_nick || '@students.bilimtest.local')
     or (p_role = 'teacher' and lower(p_email) like '%@students.bilimtest.local') then
    raise exception 'Адрес входа не подходит для роли' using errcode = 'check_violation';
  end if;
  if (p_role = 'teacher' and v_first = '') or length(v_first) > 60 or length(v_last) > 60 then
    raise exception 'Не указано имя' using errcode = 'check_violation';
  end if;
  if p_role = 'teacher' and v_last = '' then
    raise exception 'Не указана фамилия' using errcode = 'check_violation';
  end if;
  if nullif(m ->> 'school_id', '') is not null then
    select id into v_school from public.schools where id::text = m ->> 'school_id' and approved;
    if v_school is null then
      raise exception 'Школа не найдена' using errcode = 'check_violation';
    end if;
  end if;
  if p_role = 'student' and coalesce((m ->> 'parent_consent')::boolean, false) is not true then
    raise exception 'Нужно согласие: 16 лет или согласие родителя' using errcode = 'check_violation';
  end if;
  return v_school;
end $$;

-- Как в миграции accounts, но без имени не падает: имя и фамилия ученика в пилоте пустые.
create or replace function public.register_student(p_user uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := (select email from auth.users where id = p_user);
  v_school uuid := public.check_signup('student', p_data, coalesce(v_email, ''));
  v_first text := trim(coalesce(p_data ->> 'first_name', ''));
  v_last text := trim(coalesce(p_data ->> 'last_name', ''));
begin
  if exists (select 1 from school.students where user_id = p_user)
     or (select role from public.profiles where id = p_user) is distinct from 'student'
     or (select nickname from public.profiles where id = p_user) is not null then
    raise exception 'Аккаунт уже зарегистрирован' using errcode = 'check_violation';
  end if;
  update public.profiles set nickname = lower(trim(p_data ->> 'nickname')), first_name = v_first, last_name = v_last,
    school_id = v_school, school_other = nullif(trim(coalesce(p_data ->> 'school_other', '')), ''),
    full_name = trim(v_first || ' ' || v_last)
  where id = p_user;
  insert into school.students (user_id, grade, recovery_email, class_code, parent_consent)
  values (p_user, (p_data ->> 'grade')::smallint, nullif(lower(trim(coalesce(p_data ->> 'recovery_email', ''))), ''),
          nullif(upper(trim(coalesce(p_data ->> 'class_code', ''))), ''), true);
end $$;

-- Лимит регистраций с одного адреса в час. p_client — IP посетителя, его передаёт функция на сервере;
-- хранится только хэш. Для школы с одним IP на всех — с запасом (№21).
create function public.signup_rate_ok(p_client text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  insert into public.rate_limits as r (bucket, client, window_start, hits)
  values ('signup', encode(sha256(convert_to('bilimtest:' || coalesce(p_client, '?'), 'utf8')), 'hex'),
          date_trunc('hour', now()), 1)
  on conflict (bucket, client, window_start) do update set hits = r.hits + 1
  returning hits into n;
  return n <= public.setting_int('student_signups_per_hour', 60);
end $$;

-- ---------- Права ----------

revoke execute on function public.admin_users(text, public.app_role, boolean, int), public.password_changed()
  from public, anon;
grant execute on function public.admin_users(text, public.app_role, boolean, int), public.password_changed()
  to authenticated;
revoke execute on function public.setup_teacher(uuid, jsonb), public.signup_rate_ok(text)
  from public, anon, authenticated;
grant execute on function public.setup_teacher(uuid, jsonb), public.signup_rate_ok(text) to service_role;
