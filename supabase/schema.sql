-- Run this once in Supabase SQL Editor.
-- It creates the private media bucket plus RLS-protected tables for ML99.

insert into storage.buckets (id, name, public, file_size_limit)
values ('ml99-media', 'ml99-media', false, 52428800)
on conflict (id) do update
set public = false,
    file_size_limit = 52428800;

create table if not exists public.ml99_media (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind = 'photo'),
  title text not null default '未命名文件',
  storage_path text not null,
  thumb_path text,
  mime_type text,
  byte_size bigint,
  original_byte_size bigint,
  width integer,
  height integer,
  duration_seconds numeric,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create index if not exists ml99_media_kind_created_at_idx
on public.ml99_media (kind, created_at desc);

alter table public.ml99_media enable row level security;

drop policy if exists "ml99_media_read" on public.ml99_media;
drop policy if exists "ml99_media_insert" on public.ml99_media;
drop policy if exists "ml99_media_update" on public.ml99_media;
drop policy if exists "ml99_media_delete" on public.ml99_media;

create policy "ml99_media_read"
on public.ml99_media
for select
to authenticated
using (true);

create policy "ml99_media_insert"
on public.ml99_media
for insert
to authenticated
with check (auth.uid() is not null);

create policy "ml99_media_update"
on public.ml99_media
for update
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

create policy "ml99_media_delete"
on public.ml99_media
for delete
to authenticated
using (auth.uid() is not null);

grant select, insert, update, delete on public.ml99_media to authenticated;
grant all on public.ml99_media to service_role;

create table if not exists public.ml99_notes (
  id uuid primary key default gen_random_uuid(),
  note_type text not null check (note_type in ('日志', '留言')),
  note_to text not null default '我们',
  title text not null default '没有标题的小记录',
  body text not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create index if not exists ml99_notes_created_at_idx
on public.ml99_notes (created_at desc);

alter table public.ml99_notes enable row level security;

drop policy if exists "ml99_notes_read" on public.ml99_notes;
drop policy if exists "ml99_notes_insert" on public.ml99_notes;
drop policy if exists "ml99_notes_update" on public.ml99_notes;
drop policy if exists "ml99_notes_delete" on public.ml99_notes;

create policy "ml99_notes_read"
on public.ml99_notes
for select
to authenticated
using (true);

create policy "ml99_notes_insert"
on public.ml99_notes
for insert
to authenticated
with check (auth.uid() is not null);

create policy "ml99_notes_update"
on public.ml99_notes
for update
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

create policy "ml99_notes_delete"
on public.ml99_notes
for delete
to authenticated
using (auth.uid() is not null);

grant select, insert, update, delete on public.ml99_notes to authenticated;
grant all on public.ml99_notes to service_role;

drop policy if exists "ml99_storage_read" on storage.objects;
drop policy if exists "ml99_storage_insert" on storage.objects;
drop policy if exists "ml99_storage_update" on storage.objects;
drop policy if exists "ml99_storage_delete" on storage.objects;

create policy "ml99_storage_read"
on storage.objects
for select
to authenticated
using (bucket_id = 'ml99-media');

create policy "ml99_storage_insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'ml99-media' and auth.uid() is not null);

create policy "ml99_storage_update"
on storage.objects
for update
to authenticated
using (bucket_id = 'ml99-media' and auth.uid() is not null)
with check (bucket_id = 'ml99-media' and auth.uid() is not null);

create policy "ml99_storage_delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'ml99-media' and auth.uid() is not null);
