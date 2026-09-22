-- 與 taskeel 共用同一個 Supabase 專案：筆記綁到同一組 auth.users。
-- 這份 SQL 在「一般 PostgreSQL（本機開發）」與「Supabase」上都能執行：
-- auth schema 不存在時，外鍵與 RLS 會自動略過。

alter table notes add column if not exists owner_id uuid;

-- 先前本機開發留下的資料沒有 owner，指派給開發用的 nil uuid
update notes set owner_id = '00000000-0000-0000-0000-000000000000' where owner_id is null;

alter table notes alter column owner_id set not null;

create index if not exists notes_owner_created_idx on notes (owner_id, created_at desc);

do $$
begin
  if to_regclass('auth.users') is null then
    return; -- 一般 PostgreSQL：沒有 Supabase Auth，保持單純
  end if;

  -- 使用者被刪除時一併清掉筆記，與 taskeel 各表一致
  if not exists (
    select 1 from pg_constraint where conname = 'notes_owner_id_fkey'
  ) then
    alter table notes
      add constraint notes_owner_id_fkey
      foreign key (owner_id) references auth.users(id) on delete cascade;
  end if;

  -- RLS：與 taskeel 相同的 owner_id = auth.uid() 規則。
  -- Go API 走直連（postgres 角色）會繞過 RLS，但它本來就把每筆查詢限縮在
  -- 已驗證的 owner；這層是給任何拿 anon key 直接連資料庫的用戶端的保險。
  execute 'alter table notes enable row level security';

  if not exists (
    select 1 from pg_policies where tablename = 'notes' and policyname = 'own notes'
  ) then
    execute 'create policy "own notes" on notes
               for all using (owner_id = auth.uid())
               with check (owner_id = auth.uid())';
  end if;
end $$;
