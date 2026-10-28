-- Учитель сбрасывает забытый пароль своему ученику (DECISIONS.md №119; этап 8).
--
-- Сам сброс делает функция на сервере admin-users (ключ сервера есть только там): она спрашивает базу
-- begin_student_reset от имени учителя и только при ответе 'ok' ставит временный пароль; при входе ученик
-- придумывает новый (must_change_password, как у админа в «Пайдаланушылар»).
-- Можно только ученику (не учителю и не админу), не заблокированному, который состоит в классе этого учителя.
-- Не чаще limits.student_resets_per_hour раз в час на учителя (по умолчанию 20).
-- Каждый сброс — в журнале school.password_resets (кто, кому, когда): с временным паролем учитель может войти
-- как ученик, журнал это показывает. Журнал читают только админ и отчёт за неделю (через сервер).

create table school.password_resets (
  id bigint generated always as identity primary key,
  teacher_id uuid not null references auth.users (id) on delete cascade,
  student_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index password_resets_created on school.password_resets (created_at desc);
revoke all on school.password_resets from public, anon, authenticated;
alter table school.password_resets enable row level security;

-- Ответ: 'ok' — можно (сброс записан в журнал), 'forbidden' — не ученик этого учителя, 'rate_limited' — лимит.
create function public.begin_student_reset(p_student uuid) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if public.my_role() is distinct from 'teacher' then
    return 'forbidden'; -- админ сбрасывает пароли сам, без этой проверки; заблокированный учитель — роли нет
  end if;
  if not exists (
    select 1 from public.profiles p
     where p.id = p_student and p.role = 'student' and p.blocked_at is null
       and exists (select 1 from school.class_members m join school.classes k on k.id = m.class_id
                    where m.student_id = p.id and k.teacher_id = auth.uid())) then
    return 'forbidden';
  end if;
  if not public.hit_rate_limit('student_reset:' || auth.uid(), public.setting_int('student_resets_per_hour', 20),
      interval '1 hour') then
    return 'rate_limited';
  end if;
  insert into school.password_resets (teacher_id, student_id) values (auth.uid(), p_student);
  return 'ok';
end $$;

revoke execute on function public.begin_student_reset(uuid) from public, anon;
grant execute on function public.begin_student_reset(uuid) to authenticated;
