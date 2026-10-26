-- Білімтест: разделы — группы тем внутри предмета и класса (DECISIONS.md №48).
-- Предмет → раздел → тема. У старых тем раздела нет (section_id пустой), сайт показывает их без группы.

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects (id) on delete restrict,
  grade smallint not null check (grade between 4 and 11),
  title_kk text not null default '',
  title_ru text not null default '',
  title_en text not null default '',
  check (title_kk <> '' or title_ru <> '' or title_en <> ''),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index sections_subject_grade on public.sections (subject_id, grade, sort_order);

-- Удаление раздела не удаляет темы: они остаются без раздела.
alter table public.topics add column section_id uuid references public.sections (id) on delete set null;
create index topics_section on public.topics (section_id);

-- Права как у тем: читают все, создают и меняют учитель и админ, удаляет админ.
grant select on public.sections to anon, authenticated;
grant insert, update, delete on public.sections to authenticated;
alter table public.sections enable row level security;

create policy "разделы: читают все" on public.sections for select to anon, authenticated using (true);
create policy "разделы: добавляет учитель" on public.sections for insert to authenticated
  with check ((select public.is_staff()));
create policy "разделы: меняет учитель" on public.sections for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy "разделы: удаляет админ" on public.sections for delete to authenticated
  using ((select public.is_admin()));
