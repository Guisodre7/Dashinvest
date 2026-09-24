-- =====================================================================
-- Simulador Patrimonial — premissas, cenários e simulações salvas.
-- Valores monetários em NUMERIC; percentuais em % (8 = 8% a.a.).
-- Depende de 0001_init.sql (users, is_authorized_user).
-- =====================================================================

-- Premissas gerais (uma linha por usuário).
create table public.projection_assumptions (
  user_id uuid primary key references public.users (id) on delete cascade,
  initial_brl numeric(20, 2) not null default 0 check (initial_brl >= 0),
  initial_usd numeric(20, 2) not null default 0 check (initial_usd >= 0),
  initial_legacy_usd numeric(20, 2) not null default 0 check (initial_legacy_usd >= 0),
  monthly_contribution_brl numeric(20, 2) not null default 0 check (monthly_contribution_brl >= 0),
  horizon_months int not null check (horizon_months between 1 and 600),
  brazil_pct numeric(7, 4) not null check (brazil_pct between 0 and 100),
  exterior_pct numeric(7, 4) not null check (exterior_pct between 0 and 100),
  usd_brl numeric(12, 6) not null check (usd_brl > 0),
  contribution_timing text not null default 'end' check (contribution_timing in ('start', 'end')),
  exterior_mode text not null default 'classes' check (exterior_mode in ('classes', 'single')),
  use_current_allocation boolean not null default true,
  class_weights jsonb not null,          -- {"growth":50,"jepq":20,"lqd":20,"vnq":10}
  stress jsonb not null,                 -- configuração do stress test
  updated_at timestamptz not null default now(),
  constraint projection_split_100 check (abs(brazil_pct + exterior_pct - 100) < 0.001)
);

-- Premissas por cenário.
create table public.projection_scenarios (
  user_id uuid not null references public.users (id) on delete cascade,
  scenario text not null check (scenario in ('pessimista', 'moderado', 'otimista')),
  brazil_ret numeric(7, 4) not null, brazil_yield numeric(7, 4) not null,
  exterior_ret numeric(7, 4) not null, exterior_yield numeric(7, 4) not null,
  growth_ret numeric(7, 4) not null, growth_yield numeric(7, 4) not null,
  jepq_ret numeric(7, 4) not null, jepq_yield numeric(7, 4) not null,
  lqd_ret numeric(7, 4) not null, lqd_yield numeric(7, 4) not null,
  vnq_ret numeric(7, 4) not null, vnq_yield numeric(7, 4) not null,
  legacy_ret numeric(7, 4) not null, legacy_yield numeric(7, 4) not null,
  inflation numeric(7, 4) not null,
  fx_change numeric(7, 4) not null,
  reinvest boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, scenario)
);

-- Simulações salvas (resumo) e série mensal.
create table public.projection_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  label text,
  created_at timestamptz not null default now(),
  horizon_months int not null,
  monthly_contribution_brl numeric(20, 2) not null,
  final_pessimista_brl numeric(20, 2) not null,
  final_moderado_brl numeric(20, 2) not null,
  final_otimista_brl numeric(20, 2) not null,
  contributed_brl numeric(20, 2) not null,
  assumptions jsonb not null,            -- formulário validado completo (auditoria)
  summary jsonb not null default '{}'::jsonb
);
create index projection_runs_user_created on public.projection_runs (user_id, created_at desc);

create table public.projection_monthly_values (
  run_id uuid not null references public.projection_runs (id) on delete cascade,
  scenario text not null check (scenario in ('pessimista', 'moderado', 'otimista')),
  month int not null,
  total_brl numeric(20, 2) not null,
  total_usd numeric(20, 2) not null,
  real_total_brl numeric(20, 2) not null,
  contributed_brl numeric(20, 2) not null,
  brazil_brl numeric(20, 2) not null,
  exterior_usd numeric(20, 2) not null,
  legacy_usd numeric(20, 2) not null,
  income_brl numeric(20, 2) not null,
  reinvested_brl numeric(20, 2) not null,
  income_cash_brl numeric(20, 2) not null,
  usd_brl numeric(12, 6) not null,
  primary key (run_id, scenario, month)
);

alter table public.projection_assumptions enable row level security;
alter table public.projection_scenarios enable row level security;
alter table public.projection_runs enable row level security;
alter table public.projection_monthly_values enable row level security;

do $$
declare t text;
begin
  foreach t in array array['projection_assumptions', 'projection_scenarios', 'projection_runs'] loop
    execute format(
      'create policy %1$s_owner on public.%1$s for all to authenticated
         using (user_id = auth.uid() and public.is_authorized_user())
         with check (user_id = auth.uid() and public.is_authorized_user())', t);
  end loop;
end $$;

create policy projection_monthly_values_owner on public.projection_monthly_values
  for all to authenticated
  using (public.is_authorized_user() and exists (
    select 1 from public.projection_runs r where r.id = run_id and r.user_id = auth.uid()))
  with check (public.is_authorized_user() and exists (
    select 1 from public.projection_runs r where r.id = run_id and r.user_id = auth.uid()));
