-- =====================================================================
-- Carteira Internacional — schema inicial
-- Painel privado de um único usuário. Nenhuma tabela guarda credenciais
-- de corretora. Dados de mercado são escritos apenas pelo backend
-- (service role); o usuário autenticado e autorizado apenas lê.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- USERS (perfil + flag de autorização)
-- ---------------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text,
  is_authorized boolean not null default false,
  base_currency text not null default 'USD',
  created_at timestamptz not null default now()
);

-- Retorna true somente para o usuário autenticado marcado como autorizado.
create or replace function public.is_authorized_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.is_authorized
  );
$$;

-- ---------------------------------------------------------------------
-- ASSETS
-- ---------------------------------------------------------------------
create table public.assets (
  ticker text primary key,
  name text not null,
  asset_type text not null check (asset_type in ('stock', 'etf')),
  category text,
  description text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- PORTFOLIO STRATEGY (pesos editáveis no painel — nunca no frontend)
-- target_weight/min_weight/max_weight em pontos percentuais (0–100).
-- ---------------------------------------------------------------------
create table public.portfolio_strategy (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  ticker text not null references public.assets (ticker),
  target_weight numeric(9, 6) not null default 0 check (target_weight >= 0 and target_weight <= 100),
  min_weight numeric(9, 6) check (min_weight is null or (min_weight >= 0 and min_weight <= 100)),
  max_weight numeric(9, 6) check (max_weight is null or (max_weight >= 0 and max_weight <= 100)),
  enabled boolean not null default true,
  -- Posição legada (ex.: VOO "Anchor"): monitorada, mas não recebe aportes.
  accepts_contributions boolean not null default true,
  is_legacy boolean not null default false,
  legacy_label text,
  priority int not null default 0,
  strategy_bucket text not null,
  updated_at timestamptz not null default now(),
  unique (user_id, ticker)
);

-- Histórico de alterações de pesos-alvo.
create table public.target_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  ticker text not null references public.assets (ticker),
  target_weight numeric(9, 6) not null,
  strategy_bucket text not null,
  effective_from timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- POSIÇÕES E TRANSAÇÕES
-- ---------------------------------------------------------------------
create table public.portfolio_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  ticker text not null references public.assets (ticker),
  quantity numeric(20, 8) not null check (quantity >= 0),
  avg_price numeric(20, 6) not null check (avg_price >= 0),
  -- Câmbio médio (BRL por USD) das compras — permite separar retorno cambial.
  avg_fx_rate numeric(12, 6),
  purchase_date date,
  broker text,
  fees numeric(20, 6) not null default 0,
  currency text not null default 'USD',
  notes text,
  updated_at timestamptz not null default now(),
  unique (user_id, ticker)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  ticker text references public.assets (ticker),
  kind text not null check (kind in ('buy', 'sell', 'deposit', 'fee')),
  quantity numeric(20, 8),
  price numeric(20, 6),
  fees numeric(20, 6) not null default 0,
  fx_rate numeric(12, 6),
  currency text not null default 'USD',
  broker text,
  trade_date date not null,
  notes text,
  created_at timestamptz not null default now()
);

create table public.dividends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  ticker text not null references public.assets (ticker),
  -- Dividendo (empresa) x distribuição (ETF: JEPQ, LQD, VNQ...)
  kind text not null check (kind in ('dividend', 'distribution')),
  amount_per_share numeric(20, 8),
  quantity numeric(20, 8),
  gross_amount numeric(20, 6) not null,
  withholding_tax numeric(20, 6) not null default 0,
  net_amount numeric(20, 6) generated always as (gross_amount - withholding_tax) stored,
  ex_date date,
  pay_date date,
  reinvested boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- DADOS DE MERCADO (escrita somente pelo backend / service role)
-- Todo registro carrega origem e carimbo de tempo.
-- ---------------------------------------------------------------------
create table public.data_sources (
  name text primary key,
  kind text not null,
  is_realtime boolean not null default false,
  delay_minutes int not null default 0,
  enabled boolean not null default true,
  priority int not null default 0,
  notes text
);

create table public.market_quotes (
  id bigint generated always as identity primary key,
  ticker text not null,
  price numeric(20, 6),
  bid numeric(20, 6),
  ask numeric(20, 6),
  change numeric(20, 6),
  change_pct numeric(12, 6),
  open numeric(20, 6),
  high numeric(20, 6),
  low numeric(20, 6),
  prev_close numeric(20, 6),
  volume numeric(24, 2),
  avg_volume numeric(24, 2),
  week52_high numeric(20, 6),
  week52_low numeric(20, 6),
  quote_timestamp timestamptz not null,
  fetched_at timestamptz not null default now(),
  source text not null,
  market_status text not null check (market_status in ('PRE-MARKET', 'OPEN', 'AFTER-HOURS', 'CLOSED')),
  is_realtime boolean not null,
  is_delayed boolean not null,
  delay_minutes int
);
create index market_quotes_ticker_ts on public.market_quotes (ticker, quote_timestamp desc);

create table public.fundamentals (
  id bigint generated always as identity primary key,
  ticker text not null,
  as_of timestamptz not null,
  source text not null,
  pe numeric, forward_pe numeric, peg numeric, ps numeric, pfcf numeric,
  ev_ebitda numeric, fcf_yield numeric, dividend_yield numeric,
  revenue_growth_yoy numeric, eps_growth_yoy numeric,
  operating_margin numeric, net_margin numeric, roe numeric, roic numeric,
  debt_to_equity numeric, current_ratio numeric,
  data jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now()
);
create index fundamentals_ticker_asof on public.fundamentals (ticker, as_of desc);

-- Histórico de estimativas — essencial para detectar revisões.
create table public.analyst_estimates (
  id bigint generated always as identity primary key,
  ticker text not null,
  period text not null,          -- ex.: '0q', '+1q', '0y', '+1y' ou data fiscal
  period_end date,
  eps_avg numeric, eps_low numeric, eps_high numeric,
  revenue_avg numeric, revenue_low numeric, revenue_high numeric,
  analyst_count int,
  source text not null,
  as_of date not null,
  fetched_at timestamptz not null default now(),
  unique (ticker, period, source, as_of)
);

create table public.analyst_revisions (
  id bigint generated always as identity primary key,
  ticker text not null,
  as_of date not null,
  strong_buy int, buy int, hold int, sell int, strong_sell int,
  target_mean numeric, target_median numeric, target_low numeric, target_high numeric,
  upgrades_30d int, downgrades_30d int, upgrades_90d int, downgrades_90d int,
  source text not null,
  fetched_at timestamptz not null default now(),
  unique (ticker, source, as_of)
);

create table public.news (
  id bigint generated always as identity primary key,
  external_id text,
  ticker text,
  title text not null,
  summary text,
  url text,
  source text not null,          -- veículo (Reuters, CNBC...)
  provider text not null,        -- API de onde veio
  published_at timestamptz not null,
  updated_at timestamptz,
  category text,
  impact text check (impact in ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  fetched_at timestamptz not null default now(),
  unique (provider, external_id)
);
create index news_ticker_published on public.news (ticker, published_at desc);

create table public.events (
  id bigint generated always as identity primary key,
  ticker text,
  kind text not null,            -- earnings, dividend, ex-dividend, fomc, cpi...
  title text not null,
  event_date date not null,
  event_time text,
  source text not null,
  data jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  unique (ticker, kind, event_date, source)
);

create table public.market_regime (
  id bigint generated always as identity primary key,
  indicator text not null,       -- SPX, NDX, VIX, US10Y, FEDFUNDS, DXY, USDBRL
  value numeric,
  change numeric,
  change_pct numeric,
  as_of timestamptz not null,
  source text not null,
  is_proxy boolean not null default false,
  proxy_for text,
  fetched_at timestamptz not null default now()
);
create index market_regime_indicator_asof on public.market_regime (indicator, as_of desc);

-- ---------------------------------------------------------------------
-- RESULTADOS DO SISTEMA
-- ---------------------------------------------------------------------
create table public.portfolio_snapshots (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  as_of timestamptz not null default now(),
  total_usd numeric not null,
  total_brl numeric,
  cost_usd numeric not null,
  cost_brl numeric,
  usd_brl numeric,
  positions jsonb not null default '[]'::jsonb
);
create index portfolio_snapshots_user_asof on public.portfolio_snapshots (user_id, as_of desc);

create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  contribution_usd numeric not null,
  invested_usd numeric not null,
  opportunity_cash_usd numeric not null default 0,
  blocked boolean not null default false,
  block_reasons jsonb not null default '[]'::jsonb,
  data_quality numeric,
  allocations jsonb not null,
  inputs jsonb not null default '{}'::jsonb
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete cascade,
  ticker text,
  kind text not null,
  severity text not null check (severity in ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  title text not null,
  message text not null,
  dedupe_key text unique,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

-- Configurações editáveis (pesos do Opportunity Score, limites etc.)
create table public.app_settings (
  user_id uuid not null references public.users (id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create table public.api_logs (
  id bigint generated always as identity primary key,
  provider text not null,
  endpoint text not null,
  ticker text,
  status int,
  latency_ms int,
  error text,
  created_at timestamptz not null default now()
);
create index api_logs_created on public.api_logs (created_at desc);

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.users enable row level security;
alter table public.assets enable row level security;
alter table public.portfolio_strategy enable row level security;
alter table public.target_allocations enable row level security;
alter table public.portfolio_positions enable row level security;
alter table public.transactions enable row level security;
alter table public.dividends enable row level security;
alter table public.data_sources enable row level security;
alter table public.market_quotes enable row level security;
alter table public.fundamentals enable row level security;
alter table public.analyst_estimates enable row level security;
alter table public.analyst_revisions enable row level security;
alter table public.news enable row level security;
alter table public.events enable row level security;
alter table public.market_regime enable row level security;
alter table public.portfolio_snapshots enable row level security;
alter table public.recommendations enable row level security;
alter table public.alerts enable row level security;
alter table public.app_settings enable row level security;
alter table public.api_logs enable row level security;

-- Perfil: o próprio usuário lê; não pode se autoautorizar.
create policy users_select_self on public.users
  for select to authenticated using (id = auth.uid());

-- Tabelas do usuário: somente o dono autorizado.
do $$
declare t text;
begin
  foreach t in array array[
    'portfolio_strategy', 'target_allocations', 'portfolio_positions',
    'transactions', 'dividends', 'portfolio_snapshots', 'recommendations',
    'app_settings'
  ] loop
    execute format(
      'create policy %1$s_owner on public.%1$s for all to authenticated
         using (user_id = auth.uid() and public.is_authorized_user())
         with check (user_id = auth.uid() and public.is_authorized_user())', t);
  end loop;
end $$;

-- Alertas: globais (user_id nulo) ou do próprio usuário.
create policy alerts_owner_select on public.alerts
  for select to authenticated
  using (public.is_authorized_user() and (user_id is null or user_id = auth.uid()));
create policy alerts_owner_update on public.alerts
  for update to authenticated
  using (public.is_authorized_user() and (user_id is null or user_id = auth.uid()));

-- Dados de mercado: somente leitura para o usuário autorizado.
do $$
declare t text;
begin
  foreach t in array array[
    'assets', 'data_sources', 'market_quotes', 'fundamentals',
    'analyst_estimates', 'analyst_revisions', 'news', 'events',
    'market_regime'
  ] loop
    execute format(
      'create policy %1$s_read on public.%1$s for select to authenticated
         using (public.is_authorized_user())', t);
  end loop;
end $$;
-- api_logs: sem políticas => acessível apenas pelo service role.

-- =====================================================================
-- SEED — ativos e fontes
-- =====================================================================
insert into public.assets (ticker, name, asset_type, category) values
  ('META', 'Meta Platforms Inc.', 'stock', 'Crescimento'),
  ('NVDA', 'NVIDIA Corporation', 'stock', 'Crescimento'),
  ('MSFT', 'Microsoft Corporation', 'stock', 'Crescimento'),
  ('AAPL', 'Apple Inc.', 'stock', 'Crescimento'),
  ('GOOGL', 'Alphabet Inc. Class A', 'stock', 'Crescimento'),
  ('BRK.B', 'Berkshire Hathaway Inc. Class B', 'stock', 'Crescimento'),
  ('JEPQ', 'JPMorgan Nasdaq Equity Premium Income ETF', 'etf', 'Renda via opções'),
  ('LQD', 'iShares iBoxx $ Investment Grade Corporate Bond ETF', 'etf', 'Crédito corporativo'),
  ('VNQ', 'Vanguard Real Estate ETF', 'etf', 'Real estate'),
  ('VOO', 'Vanguard S&P 500 ETF', 'etf', 'Posição legada / Anchor');

insert into public.data_sources (name, kind, is_realtime, delay_minutes, priority, notes) values
  ('finnhub', 'quotes,fundamentals,analysts,news,events', true, 0, 10,
   'Cotações US em tempo real conforme plano contratado.'),
  ('alphavantage', 'daily,fundamentals,estimates,news,macro,fx', false, 15, 5,
   'Plano gratuito: cotações com atraso. Plano premium: realtime/15min conforme contrato.');

-- =====================================================================
-- BOOTSTRAP DO DONO
-- Após criar o usuário no Supabase Auth (signup desabilitado), rodar:
--   select public.bootstrap_owner('seu-email@exemplo.com');
-- =====================================================================
create or replace function public.bootstrap_owner(owner_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(owner_email);
  if uid is null then
    raise exception 'Usuário % não encontrado em auth.users', owner_email;
  end if;

  insert into public.users (id, email, display_name, is_authorized)
  values (uid, owner_email, 'Guilherme', true)
  on conflict (id) do update set is_authorized = true;

  insert into public.portfolio_strategy
    (user_id, ticker, target_weight, min_weight, max_weight, enabled,
     accepts_contributions, is_legacy, legacy_label, priority, strategy_bucket)
  values
    (uid, 'META',  8.333333, 5, 12, true, true, false, null, 1, 'CRESCIMENTO'),
    (uid, 'NVDA',  8.333333, 5, 12, true, true, false, null, 1, 'CRESCIMENTO'),
    (uid, 'MSFT',  8.333333, 5, 12, true, true, false, null, 1, 'CRESCIMENTO'),
    (uid, 'AAPL',  8.333333, 5, 12, true, true, false, null, 1, 'CRESCIMENTO'),
    (uid, 'GOOGL', 8.333333, 5, 12, true, true, false, null, 1, 'CRESCIMENTO'),
    (uid, 'BRK.B', 8.333333, 5, 12, true, true, false, null, 1, 'CRESCIMENTO'),
    (uid, 'JEPQ', 20, 15, 25, true, true, false, null, 2, 'RENDA VIA OPÇÕES'),
    (uid, 'LQD',  20, 15, 25, true, true, false, null, 2, 'CRÉDITO CORPORATIVO'),
    (uid, 'VNQ',  10,  6, 14, true, true, false, null, 3, 'REAL ESTATE'),
    (uid, 'VOO',   0, null, null, true, false, true, 'Posição legada / Anchor', 9, 'LEGADO')
  on conflict (user_id, ticker) do nothing;

  insert into public.target_allocations (user_id, ticker, target_weight, strategy_bucket)
  select user_id, ticker, target_weight, strategy_bucket
  from public.portfolio_strategy where user_id = uid;

  return uid;
end $$;

revoke all on function public.bootstrap_owner(text) from public, anon, authenticated;
