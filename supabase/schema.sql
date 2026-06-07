-- ============================================================
--  Runway — database schema
--  Run this once in your Supabase project:
--    Supabase Dashboard → SQL Editor → paste → Run
-- ============================================================

-- A "client" is a household (single person or a couple).
create table if not exists public.clients (
  id           uuid primary key default gen_random_uuid(),
  adviser_id   uuid not null references auth.users(id) on delete cascade,
  display_name text not null default 'New client',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- A "plan" is a saved scenario for a client. The full model state is
-- stored as JSON in `data` — this lets the model evolve without database
-- migrations. A client can have several plans (e.g. "Current", "Scenario B").
create table if not exists public.plans (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  adviser_id  uuid not null references auth.users(id) on delete cascade,
  name        text not null default 'Base plan',
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists clients_adviser_idx on public.clients(adviser_id);
create index if not exists plans_client_idx    on public.plans(client_id);
create index if not exists plans_adviser_idx   on public.plans(adviser_id);

-- Keep updated_at fresh automatically.
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists clients_touch on public.clients;
create trigger clients_touch before update on public.clients
  for each row execute function public.touch_updated_at();

drop trigger if exists plans_touch on public.plans;
create trigger plans_touch before update on public.plans
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
--  Row Level Security — an adviser can only ever touch their own
--  clients and plans. This is enforced by the database itself, so
--  even a bug in the app cannot leak one adviser's data to another.
-- ------------------------------------------------------------
alter table public.clients enable row level security;
alter table public.plans   enable row level security;

drop policy if exists "advisers manage own clients" on public.clients;
create policy "advisers manage own clients" on public.clients
  for all
  using (auth.uid() = adviser_id)
  with check (auth.uid() = adviser_id);

drop policy if exists "advisers manage own plans" on public.plans;
create policy "advisers manage own plans" on public.plans
  for all
  using (auth.uid() = adviser_id)
  with check (auth.uid() = adviser_id);
