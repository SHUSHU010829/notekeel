-- ============================================================
-- notekeel — 隨手記的資料表
-- 與 taskeel 共用同一個 Supabase 專案：同一組 auth.users，
-- 這裡只新增 notes 一張表，不動 taskeel 既有的任何東西。
-- 在 Supabase Dashboard → SQL Editor 貼上執行一次即可。
-- ============================================================

create extension if not exists vector;

create table if not exists notes (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  content    text not null,
  -- voyage-4-lite 預設 512 維；改維度的話這裡與 EMBEDDING_DIMENSIONS 要一起改
  embedding  vector(512),
  created_at timestamptz not null default now()
);

-- HNSW 不需要先有資料訓練，空表就能用（ivfflat 要先訓練分群）
create index if not exists notes_embedding_hnsw
  on notes using hnsw (embedding vector_cosine_ops);
create index if not exists notes_owner_created_idx
  on notes (owner_id, created_at desc);

-- RLS：與 taskeel 各表同一套寫法
alter table notes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'notes' and policyname = 'own notes'
  ) then
    execute 'create policy "own notes" on notes
               for all using (owner_id = auth.uid())
               with check (owner_id = auth.uid())';
  end if;
end $$;

-- ---------- 語意搜尋 ----------
-- PostgREST 沒辦法直接下 `<=>` 排序，所以包成 function。
-- security invoker：RLS 照常生效，只會搜到自己的筆記。
create or replace function match_notes(
  query_embedding vector(512),
  match_count     int default 8,
  min_similarity  float default 0
)
returns table (
  id         uuid,
  content    text,
  created_at timestamptz,
  similarity float
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    notes.id,
    notes.content,
    notes.created_at,
    1 - (notes.embedding <=> query_embedding) as similarity
  from notes
  where notes.embedding is not null
    and 1 - (notes.embedding <=> query_embedding) >= min_similarity
  order by notes.embedding <=> query_embedding
  limit match_count
$$;
