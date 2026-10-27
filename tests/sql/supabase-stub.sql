-- Упрощённая замена служебных частей Supabase для локальной проверки миграций в PGlite.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}',
  raw_app_meta_data jsonb not null default '{}', email_confirmed_at timestamptz, banned_until timestamptz);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner_id text);
alter table storage.objects enable row level security;
grant usage on schema public, auth, storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
