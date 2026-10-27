-- Білімтест: аккаунты учителей и учеников — регистрация через «Кіру» (DECISIONS.md №70–75).
--
-- Роль ставит база, из формы она не берётся как есть. Пути создания аккаунта:
--   1. Учитель регистрируется на сайте (signUp): в user_metadata role = 'teacher' и анкета → триггер проверяет
--      анкету, роль teacher. Вход — после подтверждения email (в Supabase должно быть включено Confirm email).
--   2. Аккаунт без роли (создал админ в панели Supabase или скрипт) → простой профиль без анкеты и прав;
--      роль меняет админ (set_user_role, make-admin).
--   3. Ученик — только через функцию на сервере student-signup: она создаёт аккаунт по пути 2, затем вызывает
--      public.register_student (её может вызвать только сервер с ключом service_role, не браузер).
-- Любая другая роль в форме, в том числе 'admin', — регистрация отклоняется.
-- Supabase ставит «подтверждён» и app_metadata уже после создания строки, поэтому триггер на них не опирается.
--
-- Данные учеников — в отдельной схеме school (№45). Учитель данные учеников пока не видит (этап 8).

-- ---------- Профиль: ник, имя, школа, блокировка ----------

alter table public.profiles
  add column nickname text check (nickname ~ '^[a-z0-9_.]{3,20}$'),
  add column first_name text not null default '' check (length(first_name) <= 60),
  add column last_name text not null default '' check (length(last_name) <= 60),
  add column school_id uuid,
  add column school_other text check (length(school_other) <= 200), -- школа не из справочника (ждёт проверки)
  add column blocked_at timestamptz;
create unique index profiles_nickname on public.profiles (nickname);

-- ---------- Справочник: области, города и районы, школы (№73) ----------

create table public.regions (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.regions (id) on delete restrict, -- пусто — область или город республиканского значения
  name_kk text not null check (name_kk <> ''),
  name_ru text not null check (name_ru <> ''),
  sort_order int not null default 0
);
create index regions_parent on public.regions (parent_id, sort_order);

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.regions (id) on delete restrict,
  name_kk text not null default '' check (length(name_kk) <= 300),
  name_ru text not null default '' check (length(name_ru) <= 300),
  check (name_kk <> '' or name_ru <> ''),
  approved boolean not null default false, -- добавлена не из открытых данных — ждёт проверки админом
  created_at timestamptz not null default now()
);
create index schools_region on public.schools (region_id) where approved;

alter table public.profiles add constraint profiles_school foreign key (school_id)
  references public.schools (id) on delete set null;

-- Что учитель указал при регистрации: предметы и классы.
create table public.teacher_info (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  subjects uuid[] not null default '{}',
  grades smallint[] not null default '{}' check (grades <@ array[4, 5, 6, 7, 8, 9, 10, 11]::smallint[])
);

-- ---------- Ученики (схема school, №45) ----------

create schema school;

create table school.students (
  user_id uuid primary key references auth.users (id) on delete cascade,
  grade smallint not null check (grade between 4 and 11),
  recovery_email text check (recovery_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(recovery_email) <= 200),
  class_code text check (class_code ~ '^[A-Z0-9]{6}$'), -- пока только хранится (этап 8)
  parent_consent boolean not null check (parent_consent), -- «мне есть 16 лет, или родитель согласен»
  consent_at timestamptz not null default now(), -- согласие с политикой конфиденциальности
  created_at timestamptz not null default now()
);

-- ---------- Настройки: переключатели регистрации и лимит черновиков (№70, №74) ----------

insert into public.app_settings (key, value) values ('signup', '{"teacher": true, "student": false}')
on conflict (key) do nothing;
update public.app_settings set value = value || '{"teacher_drafts_per_day": 50}' where key = 'limits';

-- Открыта ли регистрация — для экрана «Тіркелу» (видят все).
create function public.signup_open() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select value from public.app_settings where key = 'signup'), '{"teacher": false, "student": false}')
$$;

-- ---------- Роль и анкета при создании аккаунта ----------

-- Проверки анкеты — те же, что в форме, но их нельзя обойти запросом к API. Возвращает школу из справочника.
create function public.check_signup(p_role public.app_role, m jsonb, p_email text) returns uuid
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
  if v_first = '' or length(v_first) > 60 or length(v_last) > 60 then
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

-- Профиль при создании аккаунта: учитель — с анкетой; без роли — простой профиль; другая роль — отказ.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}');
  v_school uuid;
  v_other text := nullif(trim(coalesce(m ->> 'school_other', '')), '');
  v_subjects uuid[];
  v_grades smallint[];
begin
  if m ->> 'role' is null then
    insert into public.profiles (id, full_name) values (new.id, coalesce(m ->> 'full_name', ''));
    return new;
  end if;
  if m ->> 'role' <> 'teacher' then
    raise exception 'Регистрация отклонена: недопустимая роль' using errcode = '42501';
  end if;

  v_school := public.check_signup('teacher', m, new.email);
  select coalesce(array_agg(s.id), '{}') into v_subjects from public.subjects s
   where s.id::text in (select jsonb_array_elements_text(coalesce(m -> 'subjects', '[]')));
  select coalesce(array_agg(distinct g::smallint), '{}') into v_grades
    from jsonb_array_elements_text(coalesce(m -> 'grades', '[]')) g;
  if v_school is null and v_other is null then
    raise exception 'Не указана школа' using errcode = 'check_violation';
  end if;
  if cardinality(v_subjects) = 0 or cardinality(v_grades) = 0 then
    raise exception 'Не указаны предметы или классы' using errcode = 'check_violation';
  end if;

  insert into public.profiles (id, role, nickname, first_name, last_name, school_id, school_other, full_name)
  values (new.id, 'teacher', lower(trim(m ->> 'nickname')), trim(m ->> 'first_name'), trim(m ->> 'last_name'),
          v_school, v_other, trim(trim(m ->> 'first_name') || ' ' || trim(m ->> 'last_name')));
  insert into public.teacher_info (user_id, subjects, grades) values (new.id, v_subjects, v_grades);
  return new;
end $$;

-- Анкета ученика: вызывает только функция на сервере student-signup сразу после создания аккаунта (путь 3).
-- p_data — как у формы: nickname, first_name, last_name, grade, school_id, school_other, recovery_email, class_code,
-- consent, parent_consent, website (ловушка).
create function public.register_student(p_user uuid, p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := (select email from auth.users where id = p_user);
  v_school uuid := public.check_signup('student', p_data, coalesce(v_email, ''));
begin
  if exists (select 1 from school.students where user_id = p_user)
     or (select role from public.profiles where id = p_user) is distinct from 'student'
     or (select nickname from public.profiles where id = p_user) is not null then
    raise exception 'Аккаунт уже зарегистрирован' using errcode = 'check_violation';
  end if;
  update public.profiles set nickname = lower(trim(p_data ->> 'nickname')), first_name = trim(p_data ->> 'first_name'),
    last_name = trim(coalesce(p_data ->> 'last_name', '')), school_id = v_school,
    school_other = nullif(trim(coalesce(p_data ->> 'school_other', '')), ''),
    full_name = trim(trim(p_data ->> 'first_name') || ' ' || trim(coalesce(p_data ->> 'last_name', '')))
  where id = p_user;
  insert into school.students (user_id, grade, recovery_email, class_code, parent_consent)
  values (p_user, (p_data ->> 'grade')::smallint, nullif(lower(trim(coalesce(p_data ->> 'recovery_email', ''))), ''),
          nullif(upper(trim(coalesce(p_data ->> 'class_code', ''))), ''), true);
end $$;

-- ---------- Роль с учётом блокировки ----------
-- Заблокированный пользователь не имеет роли: все правила «учитель / админ» для него не срабатывают.

create or replace function public.my_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid() and blocked_at is null
$$;

-- Блокировка (админ): вход запрещается в Supabase Auth, роль перестаёт действовать.
create function public.set_user_blocked(p_user uuid, p_blocked boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Блокирует только админ' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'Нельзя заблокировать себя' using errcode = 'check_violation';
  end if;
  update public.profiles set blocked_at = case when p_blocked then now() end where id = p_user;
  -- 100 лет, а не 'infinity': Supabase Auth не читает бесконечную дату
  update auth.users set banned_until = case when p_blocked then now() + interval '100 years' end where id = p_user;
end $$;

-- Удаление своего аккаунта: профиль, данные ученика и анкета удаляются вместе с ним.
-- Вопросы учителя остаются (автор становится пустым). Последний админ себя удалить не может.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Не выполнен вход' using errcode = '42501';
  end if;
  if public.is_admin() and not exists (select 1 from public.profiles where role = 'admin' and id <> auth.uid()) then
    raise exception 'Нельзя удалить последнего админа' using errcode = 'check_violation';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

-- ---------- Лимит черновиков учителя в сутки (№74) ----------
-- Считаются все вопросы, созданные учителем с полуночи по времени Алматы (и из формы, и из Excel).

create function public.check_teacher_draft_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_limit int := public.setting_int('teacher_drafts_per_day', 50);
  v_since timestamptz := date_trunc('day', now() at time zone 'Asia/Almaty') at time zone 'Asia/Almaty';
begin
  if public.my_role() = 'teacher' and (
    select count(*) from public.questions where author_id = auth.uid() and created_at >= v_since) >= v_limit then
    raise exception 'Дневной лимит черновиков: %', v_limit using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger questions_teacher_limit before insert on public.questions
for each row execute function public.check_teacher_draft_limit();

-- ---------- Права ----------

-- Ник сам не меняется: у ученика вместе с ним меняется адрес входа (функция — шаг 7 плана).
grant update (full_name, first_name, last_name, school_id, school_other) on public.profiles to authenticated;

grant select on public.regions, public.schools to anon, authenticated;
grant insert, update, delete on public.regions, public.schools to authenticated;
grant select on public.teacher_info to authenticated;
grant update (subjects, grades) on public.teacher_info to authenticated;
alter table public.regions enable row level security;
alter table public.schools enable row level security;
alter table public.teacher_info enable row level security;

create policy "регионы: читают все" on public.regions for select to anon, authenticated using (true);
create policy "регионы: добавляет админ" on public.regions for insert to authenticated
  with check ((select public.is_admin()));
create policy "регионы: меняет админ" on public.regions for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "регионы: удаляет админ" on public.regions for delete to authenticated
  using ((select public.is_admin()));
create policy "школы: одобренные видят все, админ — все" on public.schools for select to anon, authenticated
  using (approved or (select public.is_admin()));
create policy "школы: добавляет админ" on public.schools for insert to authenticated
  with check ((select public.is_admin()));
create policy "школы: меняет админ" on public.schools for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "школы: удаляет админ" on public.schools for delete to authenticated
  using ((select public.is_admin()));
create policy "анкета учителя: своя или админ" on public.teacher_info for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "анкета учителя: правит сам" on public.teacher_info for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Схема school: ученик видит и меняет свою строку; админ видит все; учитель — ничего (до этапа 8).
revoke all on schema school from public;
grant usage on schema school to authenticated;
grant select on school.students to authenticated;
grant update (grade, recovery_email, class_code) on school.students to authenticated;
alter table school.students enable row level security;
create policy "ученик: своя строка или админ" on school.students for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "ученик: правит свою строку" on school.students for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke execute on function public.check_teacher_draft_limit() from public, anon, authenticated;
revoke execute on function public.check_signup(public.app_role, jsonb, text) from public, anon, authenticated;
revoke execute on function public.register_student(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.register_student(uuid, jsonb) to service_role;
revoke execute on function public.set_user_blocked(uuid, boolean), public.delete_my_account() from public, anon;
grant execute on function public.signup_open() to anon, authenticated;
grant execute on function public.set_user_blocked(uuid, boolean), public.delete_my_account() to authenticated;
