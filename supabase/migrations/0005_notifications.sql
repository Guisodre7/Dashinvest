-- =====================================================================
-- 0005 — Notificações (Web Push) e central de notificações
-- Idempotente: pode ser executado mais de uma vez no SQL Editor.
-- =====================================================================

-- Dispositivos inscritos (um por navegador/web app instalado).
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device text,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

-- Histórico: tudo o que o monitor decidiu avisar (enviado ou não).
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  category text not null,
  priority text not null check (priority in ('critical', 'high', 'medium', 'info')),
  market text check (market in ('BR', 'US')),
  ticker text,
  title text not null,
  body text not null,
  reason text,
  url text not null default '/',
  dedupe_key text not null,
  group_key text,
  delivery text not null check (delivery in ('sent', 'quiet', 'in_app', 'failed', 'test')),
  sent_at timestamptz,
  opened_at timestamptz,
  read_at timestamptz,
  archived boolean not null default false,
  important boolean not null default false
);
create index if not exists notifications_user_created on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_key on public.notifications (user_id, dedupe_key, created_at desc);

alter table public.push_subscriptions enable row level security;
alter table public.notifications enable row level security;

do $$
declare t text;
begin
  foreach t in array array['push_subscriptions', 'notifications'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_owner') then
      execute format(
        'create policy %1$s_owner on public.%1$s for all to authenticated
           using (user_id = auth.uid() and public.is_authorized_user())
           with check (user_id = auth.uid() and public.is_authorized_user())', t);
    end if;
  end loop;
end $$;
