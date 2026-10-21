-- Білімтест: таблицы, проверки и триггеры.
-- Правила доступа (RLS) — в следующей миграции.

create type public.app_role as enum ('student', 'teacher', 'admin');
create type public.question_status as enum ('draft', 'review', 'published');
create type public.report_status as enum ('new', 'fixed', 'rejected');
create type public.lang_code as enum ('kk', 'ru', 'en');

-- Профиль пользователя. Создаётся автоматически при регистрации (триггер ниже).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (length(full_name) <= 200),
  role public.app_role not null default 'student',
  created_at timestamptz not null default now()
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9_-]{1,40}$'),
  icon text not null default '' check (length(icon) <= 8),
  name_kk text not null check (name_kk <> ''),
  name_ru text not null check (name_ru <> ''),
  name_en text not null check (name_en <> ''),
  only_lang public.lang_code, -- языковой предмет: вопросы только на этом языке
  sort_order int not null default 0
);

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects (id) on delete restrict,
  grade smallint not null check (grade between 4 and 11),
  title_kk text not null default '',
  title_ru text not null default '',
  title_en text not null default '',
  check (title_kk <> '' or title_ru <> '' or title_en <> ''),
  sort_order int not null default 0,
  legacy_key text unique, -- «предмет|класс|номер» из data/*.json, для повторного импорта
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index topics_subject_grade on public.topics (subject_id, grade, sort_order);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics (id) on delete restrict,
  text_kk text,
  text_ru text,
  text_en text,
  explanation_kk text,
  explanation_ru text,
  explanation_en text,
  image_url text,
  difficulty smallint not null default 2 check (difficulty between 1 and 3),
  status public.question_status not null default 'draft',
  author_id uuid default auth.uid() references public.profiles (id) on delete set null,
  review_comment text, -- почему админ вернул вопрос на доработку
  sort_order int not null default 0,
  legacy_key text unique, -- «предмет|класс|тема|вопрос» из data/*.json
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index questions_topic on public.questions (topic_id, status, sort_order);
create index questions_author on public.questions (author_id);
create index questions_status on public.questions (status);

-- Варианты ответа. sort_order 0–3: не больше 4 вариантов; id варианта не меняется при повторном импорте.
create table public.options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  text_kk text,
  text_ru text,
  text_en text,
  is_correct boolean not null default false,
  sort_order smallint not null default 0 check (sort_order between 0 and 3),
  unique (question_id, sort_order)
);

-- Попытка теста. topic_id пустой у смешанного теста; user_id пустой у анонимного ученика.
create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  subject_id uuid references public.subjects (id) on delete cascade,
  grade smallint check (grade between 4 and 11),
  topic_id uuid references public.topics (id) on delete cascade,
  score int not null check (score >= 0),
  total int not null check (total > 0 and score <= total),
  created_at timestamptz not null default now()
);
create index attempts_topic on public.attempts (topic_id, created_at);
create index attempts_user on public.attempts (user_id);

-- Сколько раз вопрос показан и сколько раз на него ответили верно.
create table public.answer_stats (
  question_id uuid primary key references public.questions (id) on delete cascade,
  shown_count bigint not null default 0,
  correct_count bigint not null default 0
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  message text not null check (length(message) between 3 and 1000),
  lang public.lang_code,
  user_id uuid references auth.users (id) on delete set null,
  status public.report_status not null default 'new',
  created_at timestamptz not null default now()
);
create index reports_status on public.reports (status, created_at desc);

-- Прежние версии вопроса (вопрос + варианты) для отката.
create table public.question_history (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  editor_id uuid references auth.users (id) on delete set null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create index question_history_question on public.question_history (question_id, created_at desc);

-- Настройки, которые админ может менять без программиста (лимиты и т. п.).
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (key, value)
values ('limits', '{"attempts_per_hour": 600, "reports_per_hour": 30}');

-- Счётчики для ограничения частоты. Хранится хэш IP-адреса, а не сам адрес.
create table public.rate_limits (
  bucket text not null,
  client text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (bucket, client, window_start)
);
create index rate_limits_window on public.rate_limits (window_start);

-- ---------- Профиль при регистрации ----------

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------- updated_at и история правок ----------

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger questions_touch before update on public.questions
for each row execute function public.touch_updated_at();

-- Перед каждым изменением вопроса сохраняем его прежнюю версию вместе с вариантами.
create function public.save_question_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.question_history (question_id, editor_id, snapshot)
  values (old.id, auth.uid(), to_jsonb(old) || jsonb_build_object('options', coalesce(
    (select jsonb_agg(to_jsonb(o) order by o.sort_order) from public.options o where o.question_id = old.id),
    '[]'::jsonb)));
  return new;
end $$;

create trigger questions_history before update on public.questions
for each row when (old is distinct from new) execute function public.save_question_history();

-- ---------- Опубликованный вопрос должен быть полным ----------
-- Черновик может быть незаконченным. При публикации: 3–4 варианта, ровно один правильный,
-- текст вопроса и всех вариантов на нужных языках (у языкового предмета — только на его языке).
-- Проверка отложена до конца транзакции, чтобы вопрос и варианты можно было сохранить вместе.

create function public.assert_question_publishable(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  q public.questions;
  v_lang public.lang_code;
  n int;
  n_correct int;
  l text;
begin
  select * into q from public.questions where id = p_id;
  if not found or q.status <> 'published' then return; end if;

  select s.only_lang into v_lang
  from public.topics t join public.subjects s on s.id = t.subject_id where t.id = q.topic_id;

  select count(*), count(*) filter (where is_correct) into n, n_correct
  from public.options where question_id = p_id;
  if n not between 3 and 4 then
    raise exception 'Вопрос %: нужно 3–4 варианта ответа, сейчас %', p_id, n using errcode = 'check_violation';
  end if;
  if n_correct <> 1 then
    raise exception 'Вопрос %: нужен ровно один правильный ответ, сейчас %', p_id, n_correct using errcode = 'check_violation';
  end if;

  foreach l in array case when v_lang is null then array['kk', 'ru', 'en'] else array[v_lang::text] end loop
    if coalesce(trim(case l when 'kk' then q.text_kk when 'ru' then q.text_ru else q.text_en end), '') = '' then
      raise exception 'Вопрос %: нет текста на языке %', p_id, l using errcode = 'check_violation';
    end if;
    if exists (
      select 1 from public.options o where o.question_id = p_id
        and coalesce(trim(case l when 'kk' then o.text_kk when 'ru' then o.text_ru else o.text_en end), '') = ''
    ) then
      raise exception 'Вопрос %: у варианта ответа нет текста на языке %', p_id, l using errcode = 'check_violation';
    end if;
  end loop;
end $$;

create function public.check_question_publishable() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_question_publishable(new.id);
  return null;
end $$;

create function public.check_option_parent_publishable() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_question_publishable(case when tg_op = 'DELETE' then old.question_id else new.question_id end);
  return null;
end $$;

create constraint trigger questions_publishable after insert or update on public.questions
deferrable initially deferred for each row execute function public.check_question_publishable();

create constraint trigger options_publishable after insert or update or delete on public.options
deferrable initially deferred for each row execute function public.check_option_parent_publishable();
