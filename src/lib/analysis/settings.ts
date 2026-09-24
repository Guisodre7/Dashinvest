/** Configurações do motor de análise — editáveis no painel (app_settings). */

export const FACTOR_KEYS = [
  "valuation", "growth", "revisions", "surprise", "quality", "momentum", "drawdown",
  "distance_high", "volatility", "risk", "weight_gap", "events", "news", "thesis",
  "consensus", "target_upside", "target_dispersion",
] as const;

export type FactorKey = (typeof FACTOR_KEYS)[number];

export const FACTOR_LABELS: Record<FactorKey, string> = {
  valuation: "Valuation / fair value",
  growth: "Crescimento esperado",
  revisions: "Revisões de estimativas",
  surprise: "Surpresa de resultados",
  quality: "Qualidade dos fundamentos",
  momentum: "Momentum",
  drawdown: "Drawdown (52 semanas)",
  distance_high: "Distância da máxima histórica",
  volatility: "Volatilidade",
  risk: "Risco (beta)",
  weight_gap: "Peso atual vs peso-alvo",
  events: "Eventos próximos",
  news: "Notícias recentes",
  thesis: "Mudança na tese",
  consensus: "Mudança no consenso",
  target_upside: "Preço-alvo vs preço",
  target_dispersion: "Dispersão dos preços-alvo",
};

export type OpportunityWeights = Record<FactorKey, number>;

export const DEFAULT_OPPORTUNITY_WEIGHTS: OpportunityWeights = {
  valuation: 12, growth: 7, revisions: 12, surprise: 4, quality: 6, momentum: 5, drawdown: 7,
  distance_high: 3, volatility: 3, risk: 3, weight_gap: 16, events: 4, news: 5, thesis: 8,
  consensus: 3, target_upside: 4, target_dispersion: 2,
};

export interface EngineSettings {
  weights: OpportunityWeights;
  /** Máximo do aporte que pode ficar em caixa de oportunidade (0–1). */
  maxOpportunityCashPct: number;
  /** Saldo máximo acumulado de caixa de oportunidade, em número de aportes. */
  maxOpportunityCashContributions: number;
  /** Ordem mínima (US$) — valores menores são redistribuídos. */
  minOrderUsd: number;
  /** Dias antes do earnings em que a prioridade é reduzida. */
  earningsCautionDays: number;
  /** Data quality mínima (0–100) para liberar recomendação automática. */
  minDataQuality: number;
  /** Anti-FOMO: alta em 30 dias (%) e em ~60 dias (%). */
  fomo1mPct: number;
  fomo60dPct: number;
}

export const DEFAULT_ENGINE_SETTINGS: EngineSettings = {
  weights: DEFAULT_OPPORTUNITY_WEIGHTS,
  maxOpportunityCashPct: 0.2,
  maxOpportunityCashContributions: 2,
  minOrderUsd: 10,
  earningsCautionDays: 7,
  minDataQuality: 60,
  fomo1mPct: 20,
  fomo60dPct: 30,
};

export function mergeSettings(raw: Partial<EngineSettings> | null | undefined): EngineSettings {
  if (!raw) return DEFAULT_ENGINE_SETTINGS;
  const weights = { ...DEFAULT_OPPORTUNITY_WEIGHTS };
  for (const k of FACTOR_KEYS) {
    const v = raw.weights?.[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) weights[k] = v;
  }
  const num = (v: unknown, d: number, lo: number, hi: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
  const d = DEFAULT_ENGINE_SETTINGS;
  return {
    weights,
    maxOpportunityCashPct: num(raw.maxOpportunityCashPct, d.maxOpportunityCashPct, 0, 0.5),
    maxOpportunityCashContributions: num(raw.maxOpportunityCashContributions, d.maxOpportunityCashContributions, 0, 6),
    minOrderUsd: num(raw.minOrderUsd, d.minOrderUsd, 0, 500),
    earningsCautionDays: num(raw.earningsCautionDays, d.earningsCautionDays, 0, 30),
    minDataQuality: num(raw.minDataQuality, d.minDataQuality, 0, 100),
    fomo1mPct: num(raw.fomo1mPct, d.fomo1mPct, 5, 100),
    fomo60dPct: num(raw.fomo60dPct, d.fomo60dPct, 5, 200),
  };
}
