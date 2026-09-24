/**
 * Tipos de dados de mercado. Todo dado vindo de um fornecedor carrega
 * metadados de procedência e validade (DataMeta). Campos ausentes são
 * `null` — nunca preenchidos com estimativas inventadas.
 */

export type MarketStatus = "PRE-MARKET" | "OPEN" | "AFTER-HOURS" | "CLOSED";

export interface DataMeta {
  /** Instante a que o dado se refere (ISO), segundo o fornecedor. */
  timestamp: string;
  /** Fornecedor (ex.: "finnhub", "alphavantage"). */
  source: string;
  /** Idade do dado em segundos no momento do cálculo. */
  data_age: number;
  market_status: MarketStatus;
  is_realtime: boolean;
  is_delayed: boolean;
  /** Atraso contratual do fornecedor, quando conhecido. */
  delay_minutes: number | null;
}

export interface Quote {
  ticker: string;
  name: string | null;
  price: number | null;
  bid: number | null;
  ask: number | null;
  spread: number | null;
  change: number | null;
  change_pct: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  prev_close: number | null;
  volume: number | null;
  avg_volume: number | null;
  week52_high: number | null;
  week52_low: number | null;
  /** Indica se o preço vem da sessão regular ou de pré/pós-mercado. */
  session: "REGULAR" | "EXTENDED" | "UNKNOWN";
  meta: DataMeta;
}

export interface DailyBar {
  time: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PriceHistory {
  ticker: string;
  bars: DailyBar[];
  /** true quando o preço é ajustado por proventos/splits. */
  adjusted: boolean;
  meta: DataMeta;
}

export interface Fundamentals {
  ticker: string;
  name: string | null;
  sector: string | null;
  market_cap: number | null;
  // Valuation
  pe: number | null;
  forward_pe: number | null;
  peg: number | null;
  ps: number | null;
  pfcf: number | null;
  ev_ebitda: number | null;
  fcf_yield: number | null;
  dividend_yield: number | null;
  // Qualidade / crescimento
  revenue_growth_yoy: number | null;
  eps_growth_yoy: number | null;
  revenue_growth_3y: number | null;
  eps_growth_3y: number | null;
  fcf_growth: number | null;
  operating_margin: number | null;
  net_margin: number | null;
  roe: number | null;
  roic: number | null;
  debt_to_equity: number | null;
  current_ratio: number | null;
  shares_change_yoy: number | null;
  eps_ttm: number | null;
  beta: number | null;
  // Histórico de valuation (quando disponível), para comparar com a própria empresa
  pe_5y_avg: number | null;
  ps_5y_avg: number | null;
  week52_high: number | null;
  week52_low: number | null;
  meta: DataMeta;
}

export interface EstimatePeriod {
  period: string; // '0q' | '+1q' | '0y' | '+1y' ou rótulo do fornecedor
  period_end: string | null;
  eps_avg: number | null;
  eps_low: number | null;
  eps_high: number | null;
  revenue_avg: number | null;
  revenue_low: number | null;
  revenue_high: number | null;
  analyst_count: number | null;
  /** Revisão do EPS médio nos últimos 30/90 dias (%), se o fornecedor informar. */
  eps_revision_30d_pct: number | null;
  eps_revision_90d_pct: number | null;
}

export interface EarningsEstimates {
  ticker: string;
  periods: EstimatePeriod[];
  /** Últimas surpresas de resultado (actual vs estimate), mais recente primeiro. */
  surprises: { period: string; actual: number | null; estimate: number | null; surprise_pct: number | null }[];
  meta: DataMeta;
}

export interface RecommendationSnapshot {
  period: string; // YYYY-MM-DD
  strong_buy: number;
  buy: number;
  hold: number;
  sell: number;
  strong_sell: number;
}

export interface AnalystData {
  ticker: string;
  /** Série mensal de consenso, mais recente primeiro. */
  recommendations: RecommendationSnapshot[];
  target_mean: number | null;
  target_median: number | null;
  target_low: number | null;
  target_high: number | null;
  target_updated_at: string | null;
  upgrades_30d: number | null;
  downgrades_30d: number | null;
  upgrades_90d: number | null;
  downgrades_90d: number | null;
  last_revision_at: string | null;
  meta: DataMeta;
}

export type NewsCategory =
  | "EARNINGS" | "AI" | "REGULATION" | "MACRO" | "INTEREST RATES" | "M&A"
  | "PRODUCT" | "MANAGEMENT" | "LEGAL" | "COMPETITION" | "CAPEX"
  | "SUPPLY CHAIN" | "REAL ESTATE" | "CREDIT" | "MARKET";

export type Impact = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface NewsItem {
  id: string;
  ticker: string | null;
  title: string;
  summary: string | null;
  url: string | null;
  /** Veículo original (Reuters, CNBC...). */
  source: string;
  /** API de onde veio. */
  provider: string;
  published_at: string;
  updated_at: string | null;
  /** Sentimento informado pelo fornecedor (-1..1), se houver. Nunca inventado. */
  provider_sentiment: number | null;
  /** Relevância para o ticker informada pelo fornecedor (0..1), se houver. */
  provider_relevance: number | null;
  category?: NewsCategory;
  impact?: Impact;
  impact_reasons?: string[];
}

export type EventKind =
  | "earnings" | "dividend" | "ex-dividend" | "investor-day" | "guidance"
  | "conference" | "fomc" | "cpi" | "jobs" | "pce" | "gdp" | "treasury" | "regulatory";

export interface MarketEvent {
  ticker: string | null;
  kind: EventKind;
  title: string;
  date: string; // YYYY-MM-DD
  time: string | null; // 'bmo' | 'amc' | HH:MM ET
  source: string;
  details: Record<string, string | number | null>;
}

export interface DividendInfo {
  ticker: string;
  kind: "dividend" | "distribution";
  history: { ex_date: string; pay_date: string | null; amount: number }[];
  trailing_12m: number | null;
  meta: DataMeta;
}

export interface MacroIndicator {
  key: "SPX" | "NDX" | "DJI" | "VIX" | "US10Y" | "FEDFUNDS" | "DXY" | "USDBRL";
  label: string;
  value: number | null;
  change: number | null;
  change_pct: number | null;
  /** Variação em 1 mês para leitura de tendência (juros subindo/caindo etc.). */
  change_1m: number | null;
  unit: "points" | "percent" | "rate";
  /** Quando o valor vem de um ETF substituto (ex.: SPY para S&P 500). */
  proxy: string | null;
  meta: DataMeta | null;
}

export class ProviderUnavailableError extends Error {
  constructor(public provider: string, public capability: string, detail?: string) {
    super(`${provider}: ${capability} indisponível${detail ? ` — ${detail}` : ""}`);
  }
}
