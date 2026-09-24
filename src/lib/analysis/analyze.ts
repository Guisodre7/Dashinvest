import { freshnessConfig } from "../freshness-config";
import { quoteFreshness, isOlderThan, type Freshness } from "../market/freshness";
import type {
  AnalystData, EarningsEstimates, Fundamentals, MarketEvent, NewsItem, PriceHistory, Quote,
} from "../market/types";
import { consensusView, estimateTrend, type ConsensusView, type EstimateTrend, type StoredEstimate } from "./estimates";
import { computeDrawdown, computeMomentum, type Drawdown, type Momentum } from "./indicators";
import { newsSignal, rankNews, type ScoredNews } from "./news";
import { FACTOR_KEYS, FACTOR_LABELS, type EngineSettings, type FactorKey } from "./settings";
import { businessQuality, fairValueView, valuationView, type BusinessQuality, type FairValueView, type ValuationView } from "./valuation";

export interface StrategyRow {
  ticker: string;
  target_weight: number; // pp
  min_weight: number | null;
  max_weight: number | null;
  enabled: boolean;
  accepts_contributions: boolean;
  is_legacy: boolean;
  legacy_label: string | null;
  priority: number;
  strategy_bucket: string;
}

export interface AssetInput {
  ticker: string;
  name: string;
  isEtf: boolean;
  strategy: StrategyRow;
  quote: Quote | null;
  history: PriceHistory | null;
  fundamentals: Fundamentals | null;
  estimates: EarningsEstimates | null;
  estimateHistory: StoredEstimate[];
  analysts: AnalystData | null;
  news: NewsItem[];
  events: MarketEvent[];
  /** Peso atual e alvo na carteira estratégica (pp). */
  currentWeight: number;
  targetWeight: number;
  /** Drawdown do mercado amplo (SPY/VOO) em 1 mês — ajuda a distinguir correção de mercado. */
  benchmarkDd1m?: number | null;
  errors?: string[];
}

export type SignalKind =
  | "VALUATION_COMPRESSION" | "THESIS_DETERIORATION" | "ANTI_FOMO" | "CORRECTION_MARKET"
  | "CORRECTION_FUNDAMENTAL" | "CORRECTION_INCONCLUSIVE" | "EARNINGS_SOON" | "OPPORTUNITY"
  | "THESIS_CHANGE" | "ABOVE_MAX_WEIGHT" | "STALE_DATA";

export interface Signal {
  kind: SignalKind;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  tone: "positive" | "negative" | "neutral";
  title: string;
  message: string;
}

export interface Factor {
  key: FactorKey;
  label: string;
  /** -1..1 (null = sem dado, excluído do cálculo). */
  value: number | null;
  weight: number;
  explanation: string;
}

export interface OpportunityScore {
  score: number | null; // 0..100
  factors: Factor[];
  coverage: number; // 0..1 dos pesos com dado
}

export interface DataQuality {
  score: number; // 0..100
  components: { key: string; label: string; ok: number; weight: number; note: string }[];
  criticalStale: boolean;
  blocksRecommendation: boolean;
}

export interface AccumulationZone {
  zone: "A" | "B" | "C" | "D";
  label: string;
  low: number | null;
  high: number | null;
  description: string;
}

export interface ZonesView {
  basis: "fair-value" | "historical-multiple" | "price-only" | "none";
  zones: AccumulationZone[];
  current: "A" | "B" | "C" | "D" | null;
  note: string;
}

export interface AssetAnalysis {
  ticker: string;
  name: string;
  isEtf: boolean;
  strategy: StrategyRow;
  quote: Quote | null;
  history: PriceHistory | null;
  fundamentals: Fundamentals | null;
  estimates: EarningsEstimates | null;
  analysts: AnalystData | null;
  price: number | null;
  freshness: Freshness;
  momentum: Momentum | null;
  drawdown: Drawdown | null;
  trend: EstimateTrend;
  consensus: ConsensusView | null;
  valuation: ValuationView;
  fairValue: FairValueView;
  quality: BusinessQuality | null;
  news: ScoredNews[];
  newsSignal: ReturnType<typeof newsSignal>;
  events: MarketEvent[];
  daysToEarnings: number | null;
  signals: Signal[];
  opportunity: OpportunityScore;
  dataQuality: DataQuality;
  confidence: { level: "Alta" | "Média" | "Baixa"; reasons: string[] };
  zones: ZonesView;
  currentWeight: number;
  targetWeight: number;
  gap: number;
  sources: string[];
  errors: string[];
}

const clamp = (v: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));
const fmt = (v: number, d = 1) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const signed = (v: number, d = 1) => `${v >= 0 ? "+" : ""}${fmt(v, d)}%`;

function daysUntil(date: string, now: Date) {
  const d = new Date(`${date}T12:00:00Z`).getTime();
  const today = new Date(`${now.toISOString().slice(0, 10)}T12:00:00Z`).getTime();
  return Math.round((d - today) / 86_400_000);
}

export function analyzeAsset(input: AssetInput, settings: EngineSettings, now = new Date()): AssetAnalysis {
  const { quote, history, fundamentals, estimates, analysts } = input;
  const price = quote?.price ?? history?.bars[history.bars.length - 1]?.close ?? null;
  const freshness = quoteFreshness(quote?.meta, now);
  const bars = history?.bars ?? [];

  const momentum = bars.length > 30 ? computeMomentum(bars, quote?.price) : null;
  const drawdown = bars.length || quote
    ? computeDrawdown(bars, price, { week52High: quote?.week52_high ?? fundamentals?.week52_high, week52Low: quote?.week52_low ?? fundamentals?.week52_low })
    : null;
  const trend = estimateTrend(estimates, input.estimateHistory);
  const consensus = consensusView(analysts, price);
  const valuation = valuationView(fundamentals, trend);
  const fairValue = fairValueView(price, fundamentals, trend, analysts, input.isEtf);
  const quality = input.isEtf ? null : businessQuality(fundamentals);
  const news = rankNews(input.news, input.ticker, input.name, now);
  const nSignal = newsSignal(news, 72, now);
  const events = input.events
    .filter((e) => daysUntil(e.date, now) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const earnings = events.find((e) => e.kind === "earnings");
  const daysToEarnings = earnings ? daysUntil(earnings.date, now) : null;
  const gap = input.targetWeight - input.currentWeight;

  const signals = detectSignals({ input, price, momentum, drawdown, trend, consensus, valuation, fairValue, nSignal, news, daysToEarnings, freshness, settings, gap });
  const opportunity = opportunityScore({ input, momentum, drawdown, trend, consensus, valuation, fairValue, quality, nSignal, daysToEarnings, signals, settings, gap, fundamentals });
  const dataQuality = computeDataQuality(input, freshness, news, settings, now);
  const zones = accumulationZones(price, fairValue, fundamentals, drawdown, trend, momentum, input.isEtf);
  const sources = [...new Set([
    quote?.meta.source, history?.meta.source, fundamentals?.meta.source, estimates?.meta.source, analysts?.meta.source,
    ...input.news.map((n) => n.provider),
  ].filter((s): s is string => !!s).flatMap((s) => s.split("+")))];
  const confidence = computeConfidence(dataQuality, opportunity, fairValue, momentum, daysToEarnings, sources, settings);

  return {
    ticker: input.ticker, name: input.name, isEtf: input.isEtf, strategy: input.strategy,
    quote, history, fundamentals, estimates, analysts, price, freshness, momentum, drawdown, trend, consensus, valuation, fairValue, quality,
    news, newsSignal: nSignal, events, daysToEarnings, signals, opportunity, dataQuality, confidence, zones,
    currentWeight: input.currentWeight, targetWeight: input.targetWeight, gap, sources, errors: input.errors ?? [],
  };
}

// ---------------------------------------------------------------------------
// Detectores
// ---------------------------------------------------------------------------

interface DetectCtx {
  input: AssetInput;
  price: number | null;
  momentum: Momentum | null;
  drawdown: Drawdown | null;
  trend: EstimateTrend;
  consensus: ConsensusView | null;
  valuation: ValuationView;
  fairValue: FairValueView;
  nSignal: ReturnType<typeof newsSignal>;
  news: ScoredNews[];
  daysToEarnings: number | null;
  freshness: Freshness;
  settings: EngineSettings;
  gap: number;
}

export function detectSignals(c: DetectCtx): Signal[] {
  const out: Signal[] = [];
  const { momentum: m, drawdown: dd, trend: t, settings } = c;

  if (c.freshness.blocksPriceDecisions) {
    out.push({
      kind: "STALE_DATA", severity: "HIGH", tone: "negative",
      title: "Dados desatualizados",
      message: `${c.freshness.label}. Decisão de aporte baseada em preço bloqueada para ${c.input.ticker}.`,
    });
  }

  // Queda de preço relevante (3 meses ou 1 mês)
  const priceMove = Math.min(dd?.dd_3m ?? 0, m?.ret_1m ?? 0, m?.ret_3m ?? 0);
  const priceDown = priceMove <= -10;
  const epsMove = t.eps_rev_90d ?? t.eps_rev_30d;

  if (priceDown && (t.direction === "rising" || t.direction === "stable")) {
    out.push({
      kind: "VALUATION_COMPRESSION", severity: "MEDIUM", tone: "positive",
      title: "🟢 Possível compressão de valuation",
      message: `Preço ${signed(priceMove)} enquanto o EPS esperado variou ${epsMove !== null ? signed(epsMove) : "pouco"}. Isso não significa comprar automaticamente — investigar oportunidade.`,
    });
  }
  if (priceDown && t.significant_cut) {
    out.push({
      kind: "THESIS_DETERIORATION", severity: "HIGH", tone: "negative",
      title: "🔴 Possível deterioração da tese",
      message: `Preço ${signed(priceMove)} e estimativas de EPS ${epsMove !== null ? signed(epsMove) : "em queda"}. Não comprar a queda sem reavaliar a tese.`,
    });
  }

  // Regra de correção (queda de 10/15/20/25/30% da máxima de 52 semanas)
  const dd52 = dd?.from_52w_high ?? null;
  if (dd52 !== null && dd52 <= -10) {
    const level = [30, 25, 20, 15, 10].find((l) => dd52 <= -l)!;
    const checks: string[] = [];
    let deterioration = 0, known = 0;
    if (t.direction !== "unknown") {
      known++;
      if (t.significant_cut) { deterioration++; checks.push("estimativas de EPS em queda relevante"); }
      else checks.push(`estimativas ${t.direction === "rising" ? "subindo" : t.direction === "stable" ? "estáveis" : "levemente em queda"}`);
    }
    if (t.revenue_rev_90d !== null) {
      known++;
      if (t.revenue_rev_90d <= -3) { deterioration++; checks.push("estimativas de receita em queda"); }
    }
    if (c.nSignal.count) {
      known++;
      if (c.nSignal.critical_negative) { deterioration++; checks.push("notícia negativa de alta relevância"); }
      else checks.push("sem notícia fundamental negativa crítica");
    }
    if (c.consensus?.change_3m !== null && c.consensus?.change_3m !== undefined) {
      known++;
      if (c.consensus.change_3m <= -0.1) { deterioration++; checks.push("consenso de analistas piorando"); }
    }
    if (c.valuation.score !== null) {
      checks.push(c.valuation.score > 0 ? "valuation relativo melhorou" : "valuation ainda exigente");
    }
    const marketWide = c.input.benchmarkDd1m !== null && c.input.benchmarkDd1m !== undefined && c.input.benchmarkDd1m <= -7;
    if (marketWide) checks.push("mercado amplo também em queda");

    let kind: SignalKind, title: string, sev: Signal["severity"], tone: Signal["tone"];
    if (deterioration >= 2) {
      kind = "CORRECTION_FUNDAMENTAL"; title = "Possível deterioração fundamental"; sev = "HIGH"; tone = "negative";
    } else if (known >= 2 && deterioration === 0) {
      kind = "CORRECTION_MARKET"; title = "Correção de mercado"; sev = "MEDIUM"; tone = "neutral";
    } else {
      kind = "CORRECTION_INCONCLUSIVE"; title = "Queda — classificação inconclusiva"; sev = "MEDIUM"; tone = "neutral";
    }
    out.push({
      kind, severity: sev, tone, title,
      message: `Queda de ${fmt(Math.abs(dd52))}% da máxima de 52 semanas (faixa ≥${level}%). Verificado: ${checks.join("; ") || "dados insuficientes"}.`,
    });
  }

  // Anti-FOMO
  const r1m = m?.ret_1m ?? null, r60 = m?.ret_60d ?? null;
  const nearHigh = dd52 !== null && dd52 >= -5;
  if (nearHigh && ((r1m !== null && r1m >= settings.fomo1mPct) || (r60 !== null && r60 >= settings.fomo60dPct))) {
    const estimatesKeptUp = epsMove !== null && r1m !== null && epsMove >= r1m / 2;
    out.push({
      kind: "ANTI_FOMO", severity: estimatesKeptUp ? "LOW" : "MEDIUM", tone: "negative",
      title: "Forte expansão recente",
      message: `Alta de ${r1m !== null ? signed(r1m) : "—"} em 30 dias${r60 !== null ? ` e ${signed(r60)} em ~60 dias` : ""}, próximo da máxima. ${estimatesKeptUp ? "As estimativas também subiram de forma relevante." : "Evitar perseguir movimento sem mudança correspondente nas estimativas fundamentais."}`,
    });
  }

  // Earnings próximos
  if (c.daysToEarnings !== null && c.daysToEarnings <= settings.earningsCautionDays) {
    out.push({
      kind: "EARNINGS_SOON", severity: c.daysToEarnings <= 2 ? "HIGH" : "MEDIUM", tone: "neutral",
      title: "Earnings próximos",
      message: `Divulgação de resultados em ${c.daysToEarnings === 0 ? "hoje" : `${c.daysToEarnings} dia${c.daysToEarnings === 1 ? "" : "s"}`}. Volatilidade elevada é comum em torno do evento.`,
    });
  }

  // Peso acima do máximo
  const maxW = c.input.strategy.max_weight;
  if (maxW !== null && c.input.currentWeight > maxW) {
    out.push({
      kind: "ABOVE_MAX_WEIGHT", severity: "LOW", tone: "neutral",
      title: "Acima do peso máximo",
      message: `Peso atual ${fmt(c.input.currentWeight)}% acima do máximo configurado (${fmt(maxW)}%). O excesso é corrigido pelos próximos aportes — nenhuma venda é sugerida.`,
    });
  }

  // Alerta de mudança de tese (combinações)
  const guidanceCut = c.news.some((n) => /guidance|outlook|forecast/i.test(n.title) && n.severe);
  const growthDecel = c.input.fundamentals?.revenue_growth_yoy !== null && c.input.fundamentals?.revenue_growth_3y !== null &&
    c.input.fundamentals !== null && (c.input.fundamentals.revenue_growth_yoy! < c.input.fundamentals.revenue_growth_3y! - 5);
  const comboA = priceDown && t.direction === "falling" && c.nSignal.negative_high.length > 0;
  const comboB = growthDecel && (c.valuation.score ?? 0) < -0.3 && guidanceCut;
  if (comboA || comboB) {
    out.push({
      kind: "THESIS_CHANGE", severity: "CRITICAL", tone: "negative",
      title: "⚠️ Alerta de mudança de tese",
      message: comboA
        ? "Queda significativa de preço combinada com queda nas estimativas e notícia fundamental negativa relevante."
        : "Crescimento desacelerando, valuation elevado e guidance reduzido.",
    });
  }

  // Alerta de oportunidade
  const deteriorating = out.some((s) => s.kind === "THESIS_DETERIORATION" || s.kind === "THESIS_CHANGE" || s.kind === "CORRECTION_FUNDAMENTAL");
  const valuationBetter = (c.valuation.pe_vs_5y !== null && c.valuation.pe_vs_5y < 0) || (c.valuation.score ?? -1) > 0 ||
    (c.fairValue.discount_pct !== null && c.fairValue.discount_pct <= -5);
  if (dd52 !== null && dd52 <= -10 && valuationBetter && (t.direction === "stable" || t.direction === "rising") && !deteriorating && !c.nSignal.critical_negative) {
    out.push({
      kind: "OPPORTUNITY", severity: "MEDIUM", tone: "positive",
      title: "Possível oportunidade de acumulação",
      message: "Drawdown relevante, valuation melhorando e estimativas estáveis/subindo, sem deterioração fundamental detectada. Verificar análise.",
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Opportunity Score
// ---------------------------------------------------------------------------

interface ScoreCtx {
  input: AssetInput;
  momentum: Momentum | null;
  drawdown: Drawdown | null;
  trend: EstimateTrend;
  consensus: ConsensusView | null;
  valuation: ValuationView;
  fairValue: FairValueView;
  quality: BusinessQuality | null;
  nSignal: ReturnType<typeof newsSignal>;
  daysToEarnings: number | null;
  signals: Signal[];
  settings: EngineSettings;
  gap: number;
  fundamentals: Fundamentals | null;
}

/**
 * Não mede "qual empresa é melhor" e sim "onde o próximo dólar parece ter
 * relação risco/retorno mais interessante AGORA dentro desta carteira".
 * Fatores sem dado são excluídos e os pesos restantes renormalizados.
 */
export function opportunityScore(c: ScoreCtx): OpportunityScore {
  const f: Record<FactorKey, { v: number | null; e: string }> = {} as never;
  const set = (k: FactorKey, v: number | null, e: string) => { f[k] = { v: v === null ? null : clamp(v), e }; };
  const { momentum: m, drawdown: dd, trend: t, valuation: val, fairValue: fv } = c;

  // valuation
  if (val.score !== null || fv.available) {
    const parts = [val.score, fv.available && fv.discount_pct !== null ? clamp(-fv.discount_pct / 20) : null].filter((x): x is number => x !== null);
    set("valuation", parts.reduce((a, b) => a + b, 0) / parts.length,
      [val.notes[0], fv.available && fv.discount_pct !== null ? `Preço ${fv.discount_pct <= 0 ? "abaixo" : "acima"} do fair value médio estimado em ${fmt(Math.abs(fv.discount_pct))}%.` : null].filter(Boolean).join(" ") || "Valuation relativo calculado.");
  } else set("valuation", null, "Sem dados de valuation confiáveis.");

  const g = t.expected_eps_growth ?? c.fundamentals?.eps_growth_yoy ?? null;
  set("growth", g !== null ? (g - 8) / 20 : null, g !== null ? `Crescimento de EPS ${t.expected_eps_growth !== null ? "esperado" : "recente"} de ${signed(g)}.` : "Sem estimativa de crescimento.");

  const r30 = t.eps_rev_30d, r90 = t.eps_rev_90d;
  set("revisions", r30 === null && r90 === null ? null : ((r90 ?? 0) / 8) * 0.6 + ((r30 ?? 0) / 4) * 0.4,
    r30 === null && r90 === null ? "Sem histórico de revisões." : `EPS revisado ${r30 !== null ? `${signed(r30)} em 30d` : ""}${r30 !== null && r90 !== null ? " e " : ""}${r90 !== null ? `${signed(r90)} em 90d` : ""}.`);

  set("surprise", t.avg_surprise_pct !== null ? t.avg_surprise_pct / 10 : null,
    t.avg_surprise_pct !== null ? `Surpresa média de ${signed(t.avg_surprise_pct)} nos últimos trimestres.` : "Sem histórico de surpresas.");

  set("quality", c.quality?.score != null ? (c.quality.score - 50) / 50 : null,
    c.quality?.score != null ? `Qualidade dos fundamentos: ${fmt(c.quality.score, 0)}/100.` : c.input.isEtf ? "Não se aplica a ETF." : "Fundamentos insuficientes.");

  if (m) {
    let s = (m.vs_sma200 ?? 0) > 0 ? 0.25 : -0.25;
    const rsiV = m.rsi14;
    if (rsiV !== null) s += rsiV > 75 ? -0.6 : rsiV > 65 ? -0.3 : rsiV < 30 ? 0.3 : 0;
    set("momentum", s, `RSI ${rsiV !== null ? fmt(rsiV, 0) : "—"}; preço ${m.vs_sma200 !== null ? `${signed(m.vs_sma200)} vs SMA200` : "sem SMA200"}.`);
  } else set("momentum", null, "Histórico insuficiente.");

  set("drawdown", dd?.from_52w_high != null ? (-dd.from_52w_high - 5) / 25 : null,
    dd?.from_52w_high != null ? `${fmt(Math.abs(dd.from_52w_high))}% abaixo da máxima de 52 semanas.` : "Sem máxima de 52 semanas.");
  set("distance_high", dd?.from_ath != null ? (-dd.from_ath - 10) / 30 : null,
    dd?.from_ath != null ? `${fmt(Math.abs(dd.from_ath))}% abaixo da máxima${dd.ath_is_partial ? " do histórico disponível" : " histórica"}.` : "Sem máxima histórica.");

  const vol = m?.volatility_60d ?? null;
  set("volatility", vol !== null ? (30 - vol) / 30 : null, vol !== null ? `Volatilidade anualizada de 60d: ${fmt(vol, 0)}%.` : "Sem volatilidade calculada.");
  const beta = c.fundamentals?.beta ?? null;
  set("risk", beta !== null ? (1.2 - beta) / 1 : null, beta !== null ? `Beta ${fmt(beta, 2)}.` : "Sem beta.");

  const tw = c.input.targetWeight;
  set("weight_gap", tw > 0 ? c.gap / (tw * 0.3) : null,
    `Peso atual ${fmt(c.input.currentWeight, 2)}% vs alvo ${fmt(tw, 2)}% (desvio ${c.gap >= 0 ? "+" : ""}${fmt(c.gap, 2)} p.p.).`);

  const dte = c.daysToEarnings;
  set("events", dte === null ? 0 : dte <= 2 ? -0.7 : dte <= c.settings.earningsCautionDays ? -0.35 : 0,
    dte === null ? "Sem evento corporativo relevante no calendário." : `Earnings em ${dte} dia(s).`);

  set("news", c.nSignal.score, c.nSignal.count
    ? `${c.nSignal.count} notícia(s) em 72h; ${c.nSignal.negative_high.length} negativa(s) relevante(s), ${c.nSignal.positive_high.length} positiva(s).`
    : "Sem notícia recente confiável.");

  const kinds = new Set(c.signals.map((s) => s.kind));
  let thesis = 0;
  if (kinds.has("VALUATION_COMPRESSION")) thesis += 0.5;
  if (kinds.has("OPPORTUNITY")) thesis += 0.4;
  if (kinds.has("THESIS_DETERIORATION") || kinds.has("CORRECTION_FUNDAMENTAL")) thesis -= 0.8;
  if (kinds.has("THESIS_CHANGE")) thesis -= 1;
  if (kinds.has("ANTI_FOMO")) thesis -= 0.5;
  set("thesis", thesis, thesis === 0 ? "Nenhuma mudança de tese detectada." : c.signals.filter((s) => s.kind !== "STALE_DATA" && s.kind !== "EARNINGS_SOON").map((s) => s.title.replace(/^[^A-Za-zÀ-ú]+/, "")).join("; "));

  const cons = c.consensus;
  set("consensus", cons?.change_3m != null ? cons.change_3m * 3 + (cons.score ?? 0) * 0.15 : cons?.score != null ? cons.score * 0.15 : null,
    cons ? `${cons.buy} buy / ${cons.hold} hold / ${cons.sell} sell${cons.change_3m != null ? `; mudança 3m ${cons.change_3m >= 0 ? "+" : ""}${fmt(cons.change_3m * 100, 0)} p.p.` : ""}.` : "Sem consenso de analistas.");
  set("target_upside", cons?.target_upside != null ? cons.target_upside / 25 : null,
    cons?.target_upside != null ? `Preço-alvo médio ${signed(cons.target_upside)} vs preço atual.` : "Sem preço-alvo.");
  set("target_dispersion", cons?.target_dispersion != null ? (40 - cons.target_dispersion) / 40 : null,
    cons?.target_dispersion != null ? `Dispersão entre preços-alvo de ${fmt(cons.target_dispersion, 0)}%.` : "Sem faixa de preços-alvo.");

  const factors: Factor[] = FACTOR_KEYS.map((k) => ({
    key: k, label: FACTOR_LABELS[k], value: f[k]?.v ?? null, weight: c.settings.weights[k], explanation: f[k]?.e ?? "",
  }));
  const total = factors.reduce((a, x) => a + x.weight, 0);
  const avail = factors.filter((x) => x.value !== null && x.weight > 0);
  const wSum = avail.reduce((a, x) => a + x.weight, 0);
  const coverage = total ? wSum / total : 0;
  const score = wSum ? 50 + 50 * (avail.reduce((a, x) => a + x.value! * x.weight, 0) / wSum) : null;
  return { score, factors, coverage };
}

// ---------------------------------------------------------------------------
// Data quality & confiança
// ---------------------------------------------------------------------------

export function computeDataQuality(input: AssetInput, fresh: Freshness, news: ScoredNews[], settings: EngineSettings, now = new Date()): DataQuality {
  const cfg = freshnessConfig;
  const comps: DataQuality["components"] = [];
  const quoteOk = { realtime: 1, fresh: 1, delayed: 0.6, stale: 0, missing: 0 }[fresh.level];
  comps.push({ key: "quote", label: "Cotação", ok: quoteOk, weight: 35, note: fresh.label });
  comps.push({
    key: "history", label: "Histórico de preços", weight: 10,
    ok: input.history && input.history.bars.length >= 200 ? 1 : input.history?.bars.length ? 0.5 : 0,
    note: input.history ? `${input.history.bars.length} pregões (${input.history.meta.source})` : "indisponível",
  });
  if (!input.isEtf) {
    const fOk = input.fundamentals ? (isOlderThan(input.fundamentals.meta.timestamp, cfg.maxFundamentalsAgeSec * 12, now) ? 0.6 : 1) : 0;
    comps.push({ key: "fundamentals", label: "Fundamentos", ok: fOk, weight: 20, note: input.fundamentals ? `fonte ${input.fundamentals.meta.source}` : "indisponível" });
    const eOk = input.estimates?.periods.length ? 1 : input.estimates ? 0.5 : 0;
    comps.push({ key: "estimates", label: "Estimativas", ok: eOk, weight: 15, note: input.estimates ? `${input.estimates.periods.length} período(s)` : "indisponível" });
    const aOk = input.analysts ? (input.analysts.recommendations.length ? 1 : 0.5) : 0;
    comps.push({ key: "analysts", label: "Analistas", ok: aOk, weight: 10, note: input.analysts ? `fonte ${input.analysts.meta.source}` : "indisponível" });
  }
  const recentCredible = news.some((n) => n.credibility_tier <= 2 && now.getTime() - new Date(n.published_at).getTime() <= cfg.maxNewsAgeSec * 1000);
  comps.push({ key: "news", label: "Notícias", ok: recentCredible ? 1 : news.length ? 0.6 : 0.4, weight: 10, note: recentCredible ? "notícias recentes de fontes confiáveis" : news.length ? "apenas notícias antigas ou de baixa credibilidade" : "sem notícia recente confiável" });

  const w = comps.reduce((a, x) => a + x.weight, 0);
  const score = (comps.reduce((a, x) => a + x.ok * x.weight, 0) / w) * 100;
  return {
    score,
    components: comps,
    criticalStale: fresh.blocksPriceDecisions,
    blocksRecommendation: fresh.blocksPriceDecisions || score < settings.minDataQuality,
  };
}

function computeConfidence(
  dq: DataQuality, opp: OpportunityScore, fv: FairValueView, m: Momentum | null,
  dte: number | null, sources: string[], settings: EngineSettings,
): { level: "Alta" | "Média" | "Baixa"; reasons: string[] } {
  const reasons: string[] = [];
  let pts = 0;
  if (dq.score >= 85) { pts += 2; reasons.push(`qualidade de dados ${fmt(dq.score, 0)}%`); }
  else if (dq.score >= 65) { pts += 1; reasons.push(`qualidade de dados moderada (${fmt(dq.score, 0)}%)`); }
  else reasons.push(`qualidade de dados baixa (${fmt(dq.score, 0)}%)`);
  if (opp.coverage >= 0.75) pts += 2; else if (opp.coverage >= 0.5) pts += 1; else reasons.push(`apenas ${fmt(opp.coverage * 100, 0)}% dos fatores com dados`);
  if (sources.length >= 2) { pts += 1; reasons.push(`${sources.length} fontes (${sources.join(", ")})`); } else reasons.push("fonte única");
  if (fv.uncertainty_pct !== null && fv.uncertainty_pct > 50) { pts -= 1; reasons.push("estimativas de fair value muito dispersas"); }
  if (m?.volatility_60d != null && m.volatility_60d > 45) { pts -= 1; reasons.push("volatilidade elevada"); }
  if (dte !== null && dte <= settings.earningsCautionDays) { pts -= 1; reasons.push("earnings próximos"); }
  if (dq.criticalStale) return { level: "Baixa", reasons: ["dado crítico (cotação) desatualizado", ...reasons] };
  return { level: pts >= 4 ? "Alta" : pts >= 2 ? "Média" : "Baixa", reasons };
}

// ---------------------------------------------------------------------------
// Zonas de acumulação
// ---------------------------------------------------------------------------

export function accumulationZones(
  price: number | null, fv: FairValueView, f: Fundamentals | null, dd: Drawdown | null,
  t: EstimateTrend, m: Momentum | null, isEtf: boolean,
): ZonesView {
  if (!price) return { basis: "none", zones: [], current: null, note: "Sem preço disponível." };
  const high52 = dd?.from_52w_high != null ? price / (1 + dd.from_52w_high / 100) : null;
  // Estimativas em queda deslocam as zonas para baixo (exige mais desconto).
  const adj = t.direction === "falling" ? 0.95 : 1;

  let anchor: number | null = null;
  let basis: ZonesView["basis"] = "none";
  let anchorLabel = "";
  if (fv.available && fv.mean) {
    anchor = fv.mean * adj; basis = "fair-value"; anchorLabel = "fair value médio estimado";
  } else if (!isEtf && f?.eps_ttm && f.eps_ttm > 0 && f.pe_5y_avg) {
    anchor = f.eps_ttm * f.pe_5y_avg * adj; basis = "historical-multiple"; anchorLabel = "preço implícito pelo P/L médio de 5 anos";
  }

  const describe = (level: number) => {
    const parts: string[] = [];
    if (high52) parts.push(`${fmt(Math.abs(Math.min(0, (level / high52 - 1) * 100)))}% de drawdown da máxima de 52 semanas`);
    if (anchor) {
      const d = (level / anchor - 1) * 100;
      parts.push(`${fmt(Math.abs(d))}% de ${d <= 0 ? "desconto" : "prêmio"} em relação ao ${anchorLabel}`);
    }
    if (m?.sma200) parts.push(`${fmt(Math.abs((level / m.sma200 - 1) * 100))}% ${level >= m.sma200 ? "acima" : "abaixo"} da SMA200`);
    return `US$${fmt(level, 2)} representaria aproximadamente ${parts.join(", ")}, mantendo-se os fundamentos atuais.`;
  };

  let bounds: [number, number, number]; // A/B, B/C, C/D
  let note: string;
  if (anchor) {
    bounds = [anchor * 0.85, anchor * 0.95, anchor * 1.05];
    note = basis === "fair-value"
      ? "Zonas combinam a faixa de fair value estimada (não é preço verdadeiro), drawdown e médias; deslocadas para baixo se as estimativas estiverem caindo."
      : "Sem fair value multi-fonte: zonas baseadas no múltiplo histórico da própria empresa — confiança menor.";
  } else if (high52) {
    basis = "price-only";
    bounds = [high52 * 0.75, high52 * 0.85, high52 * 0.95];
    note = isEtf
      ? "ETF: zonas baseadas em drawdown e médias; complemente com yield, duration e composição."
      : "Sem valuation confiável: zonas baseadas apenas em preço — baixa confiança.";
  } else {
    return { basis: "none", zones: [], current: null, note: "Dados insuficientes para zonas de acumulação." };
  }

  const zones: AccumulationZone[] = [
    { zone: "A", label: "Oportunidade elevada", low: null, high: bounds[0], description: describe(bounds[0]) },
    { zone: "B", label: "Oportunidade normal", low: bounds[0], high: bounds[1], description: describe(bounds[1]) },
    { zone: "C", label: "Preço razoável", low: bounds[1], high: bounds[2], description: describe(bounds[2]) },
    { zone: "D", label: "Preço esticado", low: bounds[2], high: null, description: `Acima de US$${fmt(bounds[2], 2)}.` },
  ];
  const current = price <= bounds[0] ? "A" : price <= bounds[1] ? "B" : price <= bounds[2] ? "C" : "D";
  return { basis, zones, current, note };
}
