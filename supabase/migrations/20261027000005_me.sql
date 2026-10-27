-- Кабинет ученика /me (план «Кіру», шаг 7): свой класс.
-- Схема school в API не открыта, поэтому класс читается и меняется функциями.
-- Права — как у самой таблицы (security invoker): ученик видит и правит только свою строку (RLS school.students).
-- Ник меняет функция на сервере account: вместе с ником меняется адрес входа ник@students.bilimtest.local (№71).

create function public.my_grade() returns smallint
language sql stable security invoker set search_path = '' as $$
  select grade from school.students where user_id = (select auth.uid())
$$;

create function public.set_my_grade(p_grade smallint) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  update school.students set grade = p_grade where user_id = (select auth.uid());
  if not found then
    raise exception 'Класс есть только у ученика' using errcode = '42501';
  end if;
end $$;

revoke execute on function public.my_grade(), public.set_my_grade(smallint) from public, anon;
grant execute on function public.my_grade(), public.set_my_grade(smallint) to authenticated;
