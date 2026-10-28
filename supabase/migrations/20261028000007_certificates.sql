-- Сертификат автора (DECISIONS.md №100, №103).
--
-- Учитель получает сертификат за рубеж опубликованных вопросов: 50, 100, 250, 500, 1000 — по одному на рубеж.
-- В сертификате — имя, школа, число вопросов, предметы и классы на день выдачи; номер и страница проверки /cert/id.
-- Таблица закрыта браузеру; работа — функциями: my_author_progress, issue_certificate (учитель),
-- certificate (кто угодно по id — для проверки).

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  teacher_id uuid not null references auth.users (id) on delete cascade,
  milestone int not null,
  questions int not null,
  full_name text not null,
  school text not null default '',
  subjects jsonb not null default '[]', -- [{name_kk, name_ru, name_en, grades: [5, 6]}]
  issued_at timestamptz not null default now(),
  unique (teacher_id, milestone)
);
revoke all on public.certificates from public, anon, authenticated;
alter table public.certificates enable row level security;

create function public.cert_milestones() returns int[]
language sql immutable as $$ select array[50, 100, 250, 500, 1000] $$;

create function public.my_published_count() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.questions where author_id = auth.uid() and status = 'published'
$$;

-- Сколько опубликовано, следующий рубеж, выданные сертификаты и рубеж, который можно получить сейчас.
create function public.my_author_progress() returns jsonb
language sql stable security definer set search_path = '' as $$
  with n as (select public.my_published_count() as published),
  got as (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'number', number, 'milestone', milestone,
    'issued_at', issued_at) order by milestone), '[]') as list, coalesce(array_agg(milestone), '{}') as ms
    from public.certificates where teacher_id = auth.uid())
  select jsonb_build_object(
    'published', n.published,
    'next', (select min(m) from unnest(public.cert_milestones()) m where m > n.published),
    'can_issue', (select max(m) from unnest(public.cert_milestones()) m where m <= n.published and not m = any(got.ms)),
    'issued', got.list)
  from n, got
$$;

create function public.issue_certificate() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_n int := public.my_published_count();
  v_m int;
  v_name text;
  v_school text;
  v_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Сертификат получает учитель' using errcode = '42501';
  end if;
  select max(m) into v_m from unnest(public.cert_milestones()) m
   where m <= v_n and not exists (select 1 from public.certificates where teacher_id = auth.uid() and milestone = m);
  if v_m is null then
    raise exception 'Пока нет нового рубежа для сертификата' using errcode = 'check_violation';
  end if;
  select trim(p.first_name || ' ' || p.last_name), coalesce(s.name_kk, p.school_other, '')
    into v_name, v_school
    from public.profiles p left join public.schools s on s.id = p.school_id where p.id = auth.uid();
  if coalesce(v_name, '') = '' then
    raise exception 'Укажите имя и фамилию в профиле' using errcode = 'check_violation';
  end if;
  insert into public.certificates (teacher_id, milestone, questions, full_name, school, subjects)
  values (auth.uid(), v_m, v_n, v_name, v_school, coalesce((
    select jsonb_agg(jsonb_build_object('name_kk', x.name_kk, 'name_ru', x.name_ru, 'name_en', x.name_en, 'grades', x.grades)
      order by x.sort_order)
    from (
      select s.name_kk, s.name_ru, s.name_en, s.sort_order, array_agg(distinct t.grade order by t.grade) as grades
        from public.questions q join public.topics t on t.id = q.topic_id join public.subjects s on s.id = t.subject_id
       where q.author_id = auth.uid() and q.status = 'published'
       group by s.id
    ) x), '[]'))
  returning id into v_id;
  return v_id;
end $$;

-- Проверка сертификата по ссылке — для всех, без входа.
create function public.certificate(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('number', number, 'full_name', full_name, 'school', school, 'questions', questions,
    'milestone', milestone, 'subjects', subjects, 'issued_at', issued_at)
  from public.certificates where id = p_id
$$;

revoke execute on function public.cert_milestones(), public.my_published_count(), public.my_author_progress(),
  public.issue_certificate(), public.certificate(uuid) from public;
grant execute on function public.my_author_progress(), public.issue_certificate() to authenticated;
grant execute on function public.certificate(uuid) to anon, authenticated;
