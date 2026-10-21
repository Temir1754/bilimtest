-- Білімтест: роли, права доступа (RLS), функции для учеников, хранилище картинок.
--
-- Кто что может:
--   все (и аноним)  — читать предметы, темы и только опубликованные вопросы;
--                     отправить попытку и жалобу через функции submit_attempt / submit_report;
--   учитель         — создавать темы и переименовывать их; создавать вопросы и править свои
--                     в статусе draft / review; публиковать не может;
--   админ           — всё: публикация, удаление, роли, настройки.

-- ---------- Роль текущего пользователя ----------

create function public.my_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid()
$$;

create function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role() in ('teacher', 'admin'), false)
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

-- Может ли текущий пользователь менять вопрос (и его варианты).
create function public.can_edit_question(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or (
    public.my_role() = 'teacher' and exists (
      select 1 from public.questions q
      where q.id = p_id and q.author_id = auth.uid() and q.status in ('draft', 'review')))
$$;

-- ---------- Права на таблицы ----------
-- Supabase по умолчанию даёт anon и authenticated все права на новые таблицы.
-- Убираем их и выдаём только нужные; строки дополнительно фильтрует RLS.

revoke all on all tables in schema public from anon, authenticated;

grant select on public.subjects, public.topics, public.questions, public.options to anon, authenticated;
grant insert, update, delete on public.subjects, public.topics, public.questions, public.options to authenticated;
grant select on public.profiles, public.attempts, public.answer_stats, public.reports,
  public.question_history, public.app_settings to authenticated;
grant update (full_name) on public.profiles to authenticated; -- роль сам себе не поменять
grant update (status) on public.reports to authenticated;
grant insert, update on public.app_settings to authenticated;

alter table public.profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.topics enable row level security;
alter table public.questions enable row level security;
alter table public.options enable row level security;
alter table public.attempts enable row level security;
alter table public.answer_stats enable row level security;
alter table public.reports enable row level security;
alter table public.question_history enable row level security;
alter table public.app_settings enable row level security;
alter table public.rate_limits enable row level security; -- политик нет: доступ только из функций

-- ---------- profiles ----------
create policy "профиль: свой или админ" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy "профиль: правка своего имени" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---------- subjects: читают все, меняет админ ----------
create policy "предметы: читают все" on public.subjects for select to anon, authenticated using (true);
create policy "предметы: добавляет админ" on public.subjects for insert to authenticated
  with check ((select public.is_admin()));
create policy "предметы: меняет админ" on public.subjects for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "предметы: удаляет админ" on public.subjects for delete to authenticated
  using ((select public.is_admin()));

-- ---------- topics: создают и переименовывают учитель и админ, удаляет админ ----------
create policy "темы: читают все" on public.topics for select to anon, authenticated using (true);
create policy "темы: добавляет учитель" on public.topics for insert to authenticated
  with check ((select public.is_staff()));
create policy "темы: меняет учитель" on public.topics for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "темы: удаляет админ" on public.topics for delete to authenticated
  using ((select public.is_admin()));

-- ---------- questions ----------
create policy "вопросы: опубликованные видят все" on public.questions for select to anon, authenticated
  using (status = 'published');
create policy "вопросы: учитель видит свои, админ все" on public.questions for select to authenticated
  using ((select public.is_admin()) or (author_id = (select auth.uid()) and (select public.is_staff())));
create policy "вопросы: учитель создаёт черновик" on public.questions for insert to authenticated
  with check ((select public.is_admin()) or (
    (select public.my_role()) = 'teacher' and author_id = (select auth.uid()) and status in ('draft', 'review')));
create policy "вопросы: учитель правит свои черновики" on public.questions for update to authenticated
  using ((select public.is_admin()) or (
    (select public.my_role()) = 'teacher' and author_id = (select auth.uid()) and status in ('draft', 'review')))
  with check ((select public.is_admin()) or (
    (select public.my_role()) = 'teacher' and author_id = (select auth.uid()) and status in ('draft', 'review')));
create policy "вопросы: удаляет админ" on public.questions for delete to authenticated
  using ((select public.is_admin()));

-- ---------- options: видны вместе с вопросом, меняются вместе с вопросом ----------
create policy "варианты: как у вопроса" on public.options for select to anon, authenticated
  using (exists (select 1 from public.questions q where q.id = question_id));
create policy "варианты: добавление" on public.options for insert to authenticated
  with check (public.can_edit_question(question_id));
create policy "варианты: правка" on public.options for update to authenticated
  using (public.can_edit_question(question_id)) with check (public.can_edit_question(question_id));
create policy "варианты: удаление" on public.options for delete to authenticated
  using (public.can_edit_question(question_id));

-- ---------- статистика, жалобы, история, настройки ----------
create policy "попытки: свои или админ" on public.attempts for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "статистика: учитель и админ" on public.answer_stats for select to authenticated
  using ((select public.is_staff()));
create policy "жалобы: видят учитель и админ" on public.reports for select to authenticated
  using ((select public.is_staff()));
create policy "жалобы: статус меняет админ" on public.reports for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "история: админ или автор вопроса" on public.question_history for select to authenticated
  using ((select public.is_admin()) or exists (
    select 1 from public.questions q where q.id = question_id and q.author_id = (select auth.uid())));
create policy "настройки: админ" on public.app_settings for select to authenticated
  using ((select public.is_admin()));
create policy "настройки: админ меняет" on public.app_settings for insert to authenticated
  with check ((select public.is_admin()));
create policy "настройки: админ правит" on public.app_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------- Смена роли (только админ) ----------

create function public.set_user_role(p_user uuid, p_role public.app_role) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Менять роли может только админ' using errcode = '42501';
  end if;
  if p_role <> 'admin' and not exists (
    select 1 from public.profiles where role = 'admin' and id <> p_user) then
    raise exception 'Нельзя убрать последнего админа' using errcode = 'check_violation';
  end if;
  update public.profiles set role = p_role where id = p_user;
end $$;

-- ---------- Ограничение частоты ----------

create function public.setting_int(p_name text, p_default int) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select (value ->> p_name)::int from public.app_settings where key = 'limits'), p_default)
$$;

-- Хэш IP-адреса посетителя (сам адрес не хранится).
create function public.client_key() returns text
language sql stable set search_path = '' as $$
  select encode(sha256(convert_to('bilimtest:' || coalesce(
    trim(split_part(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ',', 1)),
    'local'), 'utf8')), 'hex')
$$;

-- true — можно, false — лимит исчерпан.
create function public.hit_rate_limit(p_bucket text, p_max int, p_window interval) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / extract(epoch from p_window))
                                * extract(epoch from p_window));
  n int;
begin
  insert into public.rate_limits as r (bucket, client, window_start, hits)
  values (p_bucket, public.client_key(), w, 1)
  on conflict (bucket, client, window_start) do update set hits = r.hits + 1
  returning hits into n;
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;
  return n <= p_max;
end $$;

-- ---------- Функции для учеников ----------

-- Результат теста. p_answers: [{"question_id": "...", "option_id": "..."}].
-- Верность ответа считает база, а не браузер, поэтому статистику нельзя подделать ответами «всё верно».
create function public.submit_attempt(p_subject_id uuid, p_grade int, p_topic_id uuid, p_answers jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_total int;
  v_score int;
  v_id uuid;
begin
  if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers) not between 1 and 50 then
    return jsonb_build_object('ok', false, 'reason', 'bad_input');
  end if;
  if not public.hit_rate_limit('attempt', public.setting_int('attempts_per_hour', 600), interval '1 hour') then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  -- Учитываются только опубликованные вопросы, каждый один раз; вариант должен принадлежать вопросу.
  with checked as (
    select distinct on (a.qid) a.qid, coalesce(o.is_correct, false) as ok
    from (
      select (x ->> 'question_id')::uuid as qid, nullif(x ->> 'option_id', '')::uuid as oid
      from jsonb_array_elements(p_answers) x
    ) a
    join public.questions q on q.id = a.qid and q.status = 'published'
    left join public.options o on o.id = a.oid and o.question_id = a.qid
  ), stats as (
    insert into public.answer_stats as s (question_id, shown_count, correct_count)
    select qid, 1, ok::int from checked
    on conflict (question_id) do update
      set shown_count = s.shown_count + 1, correct_count = s.correct_count + excluded.correct_count
  )
  select count(*), count(*) filter (where ok) into v_total, v_score from checked;
  if v_total = 0 then
    return jsonb_build_object('ok', false, 'reason', 'bad_input');
  end if;

  insert into public.attempts (user_id, subject_id, grade, topic_id, score, total)
  values (auth.uid(), p_subject_id, p_grade, p_topic_id, v_score, v_total)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'score', v_score, 'total', v_total);
exception when invalid_text_representation or foreign_key_violation or check_violation then
  return jsonb_build_object('ok', false, 'reason', 'bad_input');
end $$;

-- Жалоба на ошибку в вопросе. p_trap — скрытое поле-ловушка: человек его не видит и не заполняет.
create function public.submit_report(p_question_id uuid, p_message text, p_lang public.lang_code default null,
  p_trap text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  msg text := trim(coalesce(p_message, ''));
begin
  if coalesce(p_trap, '') <> '' then
    return jsonb_build_object('ok', true); -- боту отвечаем «принято», но ничего не сохраняем
  end if;
  if length(msg) not between 3 and 1000 then
    return jsonb_build_object('ok', false, 'reason', 'bad_message');
  end if;
  if not exists (select 1 from public.questions where id = p_question_id and status = 'published') then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if not public.hit_rate_limit('report', public.setting_int('reports_per_hour', 30), interval '1 hour') then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  insert into public.reports (question_id, message, lang, user_id) values (p_question_id, msg, p_lang, auth.uid());
  return jsonb_build_object('ok', true);
end $$;

-- Служебные функции нельзя вызывать напрямую через API.
revoke execute on function public.hit_rate_limit(text, int, interval) from public, anon, authenticated;
revoke execute on function public.assert_question_publishable(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.save_question_history() from public, anon, authenticated;
revoke execute on function public.check_question_publishable() from public, anon, authenticated;
revoke execute on function public.check_option_parent_publishable() from public, anon, authenticated;
grant execute on function public.my_role(), public.is_staff(), public.is_admin(),
  public.can_edit_question(uuid) to anon, authenticated; -- нужны правилам доступа
grant execute on function public.set_user_role(uuid, public.app_role) to authenticated;
grant execute on function public.submit_attempt(uuid, int, uuid, jsonb) to anon, authenticated;
grant execute on function public.submit_report(uuid, text, public.lang_code, text) to anon, authenticated;

-- ---------- Картинки к вопросам ----------
-- Публичная корзина: картинки видят все; загружают учитель и админ; удаляет автор или админ.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('question-images', 'question-images', true, 2097152,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "картинки: загружают учитель и админ" on storage.objects for insert to authenticated
  with check (bucket_id = 'question-images' and (select public.is_staff()));
create policy "картинки: меняет автор или админ" on storage.objects for update to authenticated
  using (bucket_id = 'question-images' and (owner_id = (select auth.uid())::text or (select public.is_admin())));
create policy "картинки: удаляет автор или админ" on storage.objects for delete to authenticated
  using (bucket_id = 'question-images' and (owner_id = (select auth.uid())::text or (select public.is_admin())));
