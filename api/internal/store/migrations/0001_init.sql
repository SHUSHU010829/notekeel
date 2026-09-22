create extension if not exists vector;

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  embedding vector({{DIMENSIONS}}),
  created_at timestamptz not null default now()
);

-- HNSW 取代計畫書上的 ivfflat：ivfflat 需要先有資料才能訓練分群，
-- 空表建索引會讓初期搜尋品質不穩；HNSW 從第一筆就可用。
create index if not exists notes_embedding_hnsw
  on notes using hnsw (embedding vector_cosine_ops);

create index if not exists notes_created_at_idx on notes (created_at desc);
