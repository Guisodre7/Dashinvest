-- =====================================================================
-- 0004 — Carteira Brasil + livro de movimentações (multi-mercado)
-- Idempotente: pode ser executado mais de uma vez no SQL Editor.
-- A carteira internacional existente (portfolio_positions/transactions)
-- não é alterada, exceto pela coluna opcional realized_pnl.
-- =====================================================================

-- Posições da carteira Brasil (ações, FIIs, renda fixa) e, no futuro,
-- de outros mercados. Renda fixa não tem cotação: o saldo é informado
-- (print, extrato) em current_value/current_value_at.
create table if not exists public.holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  market text not null check (market in ('BR', 'US')),
  asset_class text not null check (asset_class in ('acao', 'fii', 'renda_fixa', 'etf', 'caixa')),
  -- Ticker (ITUB4, HGLG11) ou identificador do título/fundo (slug do nome).
  code text not null check (char_length(code) between 1 and 60),
  name text,
  cnpj text,
  issuer text,
  quantity numeric(24, 8) not null default 0 check (quantity >= 0),
  avg_price numeric(20, 6) not null default 0 check (avg_price >= 0),
  -- Custo da posição ainda aberta (capital aportado que continua investido).
  cost_basis numeric(20, 2) not null default 0 check (cost_basis >= 0),
  current_value numeric(20, 2) check (current_value is null or current_value >= 0),
  current_value_at timestamptz,
  currency text not null default 'BRL',
  notes text,
  updated_at timestamptz not null default now(),
  unique (user_id, market, code)
);

-- Livro de movimentações: tudo o que entra, sai ou rende.
create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  market text not null check (market in ('BR', 'US')),
  asset_class text not null check (asset_class in ('acao', 'fii', 'renda_fixa', 'etf', 'caixa')),
  code text not null,
  kind text not null check (kind in ('buy', 'sell', 'contribution', 'redemption', 'dividend', 'income', 'fee', 'balance')),
  trade_date date not null,
  quantity numeric(24, 8) check (quantity is null or quantity >= 0),
  price numeric(20, 6) check (price is null or price >= 0),
  -- Valor financeiro da movimentação (sempre positivo; o sentido vem de kind).
  amount numeric(20, 2) not null check (amount >= 0),
  fees numeric(20, 2) not null default 0 check (fees >= 0),
  realized_pnl numeric(20, 2),
  -- Preço médio da posição depois da movimentação (para o histórico).
  avg_price_after numeric(20, 6),
  currency text not null default 'BRL',
  source text not null default 'manual' check (source in ('manual', 'print', 'import')),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists ledger_entries_user_date on public.ledger_entries (user_id, market, trade_date desc);

-- Venda na carteira internacional: lucro realizado gravado no momento da venda.
alter table public.transactions add column if not exists realized_pnl numeric(20, 6);

alter table public.holdings enable row level security;
alter table public.ledger_entries enable row level security;

do $$
declare t text;
begin
  foreach t in array array['holdings', 'ledger_entries'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_owner') then
      execute format(
        'create policy %1$s_owner on public.%1$s for all to authenticated
           using (user_id = auth.uid() and public.is_authorized_user())
           with check (user_id = auth.uid() and public.is_authorized_user())', t);
    end if;
  end loop;
end $$;
