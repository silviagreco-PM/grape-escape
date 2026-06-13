-- The Grape Escape — schema database Supabase
-- Da incollare in: Supabase → SQL Editor → New query → Run

-- 1. Tabella task
create table if not exists public.tasks (
  id            text primary key,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo          text,
  casa          text,
  ospite        text,
  canale        text,
  importo       numeric,
  cohost        numeric,
  codice        text,
  data_doc      text,
  scadenza      date,
  link          text,
  note          text,
  completato    boolean default false,
  completato_il date,
  completato_alle text,
  in_batch      boolean default false,
  creato_il     timestamptz default now()
);

-- 2. Sicurezza: ogni utente vede solo i propri task
alter table public.tasks enable row level security;

create policy "tasks_select_own" on public.tasks
  for select using (auth.uid() = user_id);
create policy "tasks_insert_own" on public.tasks
  for insert with check (auth.uid() = user_id);
create policy "tasks_update_own" on public.tasks
  for update using (auth.uid() = user_id);
create policy "tasks_delete_own" on public.tasks
  for delete using (auth.uid() = user_id);

-- 3. Sync in tempo reale: abilita realtime sulla tabella
alter publication supabase_realtime add table public.tasks;

-- 4. Tabella subscription push (notifiche native Android)
-- Da eseguire in: Supabase → SQL Editor → New query → Run
create table if not exists public.push_subscriptions (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  endpoint     text not null,
  subscription jsonb not null,
  created_at   timestamptz default now(),
  unique (user_id, endpoint)
);
alter table public.push_subscriptions enable row level security;
create policy "push_select_own" on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy "push_insert_own" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy "push_delete_own" on public.push_subscriptions
  for delete using (auth.uid() = user_id);
