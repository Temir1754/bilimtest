-- Задания со сроком (DECISIONS.md №110; этап 8).
-- Учитель даёт классу тему и срок («до пятницы»). Отдельной сдачи нет: задание выполнено, если ученик решил тест
-- по этой теме после выдачи и до конца дня срока (по времени Алматы). Результат — лучший такой тест.
--
-- school.assignments — задание; функции: create_assignment, delete_assignment, class_assignments (учитель),
-- my_assignments (ученик).

create table school.assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references school.classes (id) on delete cascade,
  topic_id uuid not null, -- public.topics.id, без внешнего ключа (№45)
  due_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index assignments_class on school.assignments (class_id, due_at desc);
revoke all on school.assignments from public, anon, authenticated;
alter table school.assignments enable row level security;

-- p_due — день срока; задание открыто до 23:59:59 этого дня по Алматы.
create function public.create_assignment(p_class_id uuid, p_topic_id uuid, p_due date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c school.classes;
  v_id uuid;
begin
  select * into c from school.classes where id = p_class_id and (teacher_id = auth.uid() or public.is_admin());
  if c.id is null then
    raise exception 'Класс не найден' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.topics where id = p_topic_id and subject_id = c.subject_id and not archived) then
    raise exception 'Тема не из предмета класса' using errcode = 'check_violation';
  end if;
  if p_due < (now() at time zone 'Asia/Almaty')::date then
    raise exception 'Срок уже прошёл' using errcode = 'check_violation';
  end if;
  insert into school.assignments (class_id, topic_id, due_at)
  values (c.id, p_topic_id, (p_due + time '23:59:59') at time zone 'Asia/Almaty')
  returning id into v_id;
  return v_id;
end $$;

create function public.delete_assignment(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from school.assignments a using school.classes c
   where a.id = p_id and c.id = a.class_id and (c.teacher_id = auth.uid() or public.is_admin());
  if not found then
    raise exception 'Задание не найдено' using errcode = 'check_violation';
  end if;
end $$;

-- Учитель: задания класса, новые сверху; у каждого — кто выполнил (лучший процент) и кто нет.
create function public.class_assignments(p_class_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c school.classes;
begin
  select * into c from school.classes where id = p_class_id and (teacher_id = auth.uid() or public.is_admin());
  if c.id is null then
    raise exception 'Класс не найден' using errcode = 'check_violation';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'topic_id', a.topic_id, 'grade', t.grade, 'title_kk', t.title_kk,
      'title_ru', t.title_ru, 'title_en', t.title_en, 'due_at', a.due_at, 'created_at', a.created_at,
      'students', (
        select coalesce(jsonb_agg(jsonb_build_object('id', m.student_id,
          'name', coalesce(nullif(m.display_name, ''), p.nickname), 'percent', r.pct, 'done_at', r.at)
          order by r.pct desc nulls last, coalesce(nullif(m.display_name, ''), p.nickname)), '[]')
        from school.class_members m join public.profiles p on p.id = m.student_id
        left join lateral (
          select max(round(100.0 * score / nullif(total, 0)))::int as pct, min(finished_at) as at
            from school.test_runs x
           where x.student_id = m.student_id and x.topic_id = a.topic_id
             and x.finished_at >= a.created_at and x.finished_at <= a.due_at
          having count(*) > 0) r on true
        where m.class_id = c.id))
      order by a.created_at desc)
    from school.assignments a left join public.topics t on t.id = a.topic_id
    where a.class_id = c.id), '[]');
end $$;

-- Ученик: задания всех его классов за последние 30 дней и будущие; выполнено ли и с каким результатом.
create function public.my_assignments() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'topic_id', a.topic_id, 'grade', t.grade,
      'title_kk', t.title_kk, 'title_ru', t.title_ru, 'title_en', t.title_en,
      'subject_kk', s.name_kk, 'subject_ru', s.name_ru, 'subject_en', s.name_en, 'icon', s.icon,
      'due_at', a.due_at, 'percent', r.pct)
    order by (r.pct is not null), a.due_at), '[]')
  from school.class_members m
    join school.assignments a on a.class_id = m.class_id
    join school.classes c on c.id = m.class_id
    left join public.topics t on t.id = a.topic_id
    left join public.subjects s on s.id = c.subject_id
    left join lateral (
      select max(round(100.0 * score / nullif(total, 0)))::int as pct from school.test_runs x
       where x.student_id = auth.uid() and x.topic_id = a.topic_id
         and x.finished_at >= a.created_at and x.finished_at <= a.due_at) r on true
  where m.student_id = auth.uid() and a.due_at > now() - interval '30 days'
$$;

revoke execute on function public.create_assignment(uuid, uuid, date), public.delete_assignment(uuid),
  public.class_assignments(uuid), public.my_assignments() from public, anon;
grant execute on function public.create_assignment(uuid, uuid, date), public.delete_assignment(uuid),
  public.class_assignments(uuid), public.my_assignments() to authenticated;
