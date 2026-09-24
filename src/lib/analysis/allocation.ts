import type { AssetAnalysis } from "./analyze";
import type { EngineSettings } from "./settings";

export type Action = "COMPRAR" | "APORTE NORMAL" | "AGUARDAR";
export type Priority = "ALTA" | "MÉDIA" | "BAIXA";

export interface AllocationLine {
  ticker: string;
  name: string;
  bucket: string;
  amount: number;
  /** Fração do valor investido. */
  share: number;
  action: Action;
  priority: Priority;
  opportunityScore: number | null;
  currentWeight: number;
  targetWeight: number;
  weightAfter: number;
  gap: number;
  why: string;
  favorable: string[];
  risks: string[];
  confidence: "Alta" | "Média" | "Baixa";
  blocked: boolean;
  dataUsed: string[];
}

export interface AllocationResult {
  contribution: number;
  invested: number;
  opportunityCash: number;
  cashReason: string | null;
  blocked: boolean;
  blockReasons: string[];
  lines: AllocationLine[];
  dataQuality: number;
  generatedAt: string;
  notes: string[];
}

export interface AllocationInput {
  contribution: number;
  analyses: AssetAnalysis[];
  /** Valor de mercado atual (US$) de cada ticker. */
  values: Record<string, number>;
  /** Saldo atual de caixa de oportunidade (US$). */
  existingOpportunityCash: number;
  settings: EngineSettings;
  /** Bloqueio global (ex.: câmbio/cotações indisponíveis). */
  globalBlockReasons?: string[];
}

const fmt = (v: number, d = 1) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const usd = (v: number) => `US$${fmt(v, 2)}`;

/**
 * Motor de alocação do aporte mensal.
 * 1. Necessidade por desvio: quanto falta para cada ativo atingir o peso-alvo após o aporte.
 * 2. Multiplicador de oportunidade (0,25x–1,75x) a partir do Opportunity Score.
 * 3. Regras: AGUARDAR em deterioração de tese/mudança de tese; anti-FOMO reduz; earnings próximos reduzem.
 * 4. Respeita peso máximo; nunca sugere venda.
 * 5. Caixa de oportunidade limitado por regra configurável.
 */
export function allocate(input: AllocationInput): AllocationResult {
  const { contribution, analyses, values, settings } = input;
  const notes: string[] = [];
  const blockReasons = [...(input.globalBlockReasons ?? [])];
  const eligible = analyses.filter((a) => a.strategy.enabled && a.strategy.accepts_contributions && !a.strategy.is_legacy && a.targetWeight > 0);

  const avgDq = eligible.length ? eligible.reduce((s, a) => s + a.dataQuality.score, 0) / eligible.length : 0;
  const staleShare = eligible.length ? eligible.filter((a) => a.dataQuality.criticalStale).length / eligible.length : 1;
  if (!eligible.length) blockReasons.push("Nenhum ativo elegível para aporte na estratégia configurada.");
  if (staleShare > 0.5) blockReasons.push("⚠️ Dados desatualizados — decisão de aporte temporariamente bloqueada.");
  if (avgDq < settings.minDataQuality) blockReasons.push(`Qualidade média dos dados (${fmt(avgDq, 0)}%) abaixo do mínimo configurado (${settings.minDataQuality}%).`);
  if (!(contribution > 0)) blockReasons.push("Informe um valor de aporte maior que zero.");

  const base: AllocationResult = {
    contribution, invested: 0, opportunityCash: 0, cashReason: null, blocked: false, blockReasons,
    lines: [], dataQuality: avgDq, generatedAt: new Date().toISOString(), notes,
  };
  if (blockReasons.length) return { ...base, blocked: true };

  const sleeve = eligible.reduce((s, a) => s + (values[a.ticker] ?? 0), 0);
  const targetSum = eligible.reduce((s, a) => s + a.targetWeight, 0);
  const totalAfter = sleeve + contribution;

  interface Work { a: AssetAnalysis; need: number; mult: number; action: Action | null; cap: number; blocked: boolean; reasons: string[] }
  const work: Work[] = eligible.map((a) => {
    const tw = a.targetWeight / targetSum;
    const value = values[a.ticker] ?? 0;
    const need = Math.max(0, tw * totalAfter - value);
    const maxW = a.strategy.max_weight !== null ? a.strategy.max_weight / 100 : null;
    const cap = maxW !== null ? Math.max(0, maxW * totalAfter - value) : Infinity;
    const score = a.opportunity.score ?? 50;
    let mult = 0.25 + (Math.max(0, Math.min(100, score)) / 100) * 1.5;
    const kinds = new Set(a.signals.map((s) => s.kind));
    const reasons: string[] = [];
    let action: Action | null = null;
    let blocked = false;

    if (a.dataQuality.blocksRecommendation) {
      blocked = true; action = "AGUARDAR"; mult = 0;
      reasons.push(a.dataQuality.criticalStale ? "cotação desatualizada" : "qualidade de dados insuficiente");
    }
    if (kinds.has("THESIS_CHANGE") || kinds.has("THESIS_DETERIORATION") || kinds.has("CORRECTION_FUNDAMENTAL")) {
      action = "AGUARDAR"; mult = 0;
      reasons.push("possível deterioração da tese");
    }
    if (kinds.has("ANTI_FOMO") && action !== "AGUARDAR") {
      mult *= 0.4;
      reasons.push("forte expansão recente de preço");
      if (value / Math.max(totalAfter, 1) >= tw) { action = "AGUARDAR"; mult = 0; }
    }
    if (kinds.has("EARNINGS_SOON") && action !== "AGUARDAR") {
      mult *= a.daysToEarnings !== null && a.daysToEarnings <= 2 ? 0.5 : 0.8;
      reasons.push("earnings próximos");
    }
    if (need <= 0) { action = action ?? "AGUARDAR"; reasons.push("acima do peso-alvo"); }
    return { a, need, mult, action, cap, blocked, reasons };
  });

  // Caixa de oportunidade: proporcional ao peso-alvo dos ativos em AGUARDAR com necessidade,
  // limitado a maxOpportunityCashPct do aporte e ao saldo máximo acumulado.
  const waitingNeed = work.filter((w) => w.action === "AGUARDAR" && !w.blocked && w.need > 0);
  const waitingTargetShare = waitingNeed.reduce((s, w) => s + w.a.targetWeight, 0) / targetSum;
  const maxBalance = settings.maxOpportunityCashContributions * contribution;
  let cash = 0;
  let cashReason: string | null = null;
  if (waitingTargetShare > 0 && settings.maxOpportunityCashPct > 0) {
    const room = Math.max(0, maxBalance - input.existingOpportunityCash);
    cash = Math.min(contribution * settings.maxOpportunityCashPct, contribution * waitingTargetShare, room);
    cash = Math.floor(cash * 100) / 100;
    if (cash > 0) {
      cashReason = `${waitingNeed.map((w) => w.a.ticker).join(", ")} em AGUARDAR com peso abaixo do alvo. Até ${fmt(settings.maxOpportunityCashPct * 100, 0)}% do aporte pode ficar em caixa; saldo máximo de ${fmt(settings.maxOpportunityCashContributions, 0)} aporte(s).`;
    } else if (room <= 0) {
      notes.push("Caixa de oportunidade já está no limite acumulado — todo o aporte é distribuído.");
    }
  }
  let investable = contribution - cash;

  // Distribuição proporcional a need × mult, respeitando cap (peso máximo) e necessidade × 1,5.
  const alloc = new Map<string, number>();
  let active = work.filter((w) => w.mult > 0 && w.need > 0);
  let remaining = investable;
  for (let iter = 0; iter < 6 && remaining > 0.005 && active.length; iter++) {
    const weightSum = active.reduce((s, w) => s + w.need * w.mult, 0);
    if (weightSum <= 0) break;
    let spent = 0;
    const next: Work[] = [];
    for (const w of active) {
      const already = alloc.get(w.a.ticker) ?? 0;
      const limit = Math.min(w.cap, w.need * 1.5) - already;
      const want = (remaining * w.need * w.mult) / weightSum;
      const give = Math.max(0, Math.min(want, limit));
      alloc.set(w.a.ticker, already + give);
      spent += give;
      if (limit - give > 0.005) next.push(w);
    }
    remaining -= spent;
    active = next;
  }
  if (remaining > 0.5) {
    // Sobrou (todos no limite): distribui pelos pesos-alvo entre elegíveis não bloqueados, respeitando cap.
    const pool = work.filter((w) => w.action !== "AGUARDAR" && w.cap > (alloc.get(w.a.ticker) ?? 0));
    const ts = pool.reduce((s, w) => s + w.a.targetWeight, 0);
    for (const w of pool) {
      const give = Math.min(w.cap - (alloc.get(w.a.ticker) ?? 0), (remaining * w.a.targetWeight) / ts);
      alloc.set(w.a.ticker, (alloc.get(w.a.ticker) ?? 0) + give);
    }
    remaining = investable - [...alloc.values()].reduce((a, b) => a + b, 0);
    if (remaining > 0.5) {
      cash += remaining;
      investable -= remaining;
      notes.push(`${usd(remaining)} sem destino dentro dos limites de peso máximo — mantidos em caixa.`);
    }
  }

  // Ordem mínima: valores pequenos são redistribuídos para os maiores.
  const small = [...alloc.entries()].filter(([, v]) => v > 0 && v < settings.minOrderUsd);
  if (small.length && [...alloc.values()].some((v) => v >= settings.minOrderUsd)) {
    const freed = small.reduce((s, [, v]) => s + v, 0);
    small.forEach(([t]) => alloc.set(t, 0));
    const big = [...alloc.entries()].filter(([, v]) => v >= settings.minOrderUsd);
    const bs = big.reduce((s, [, v]) => s + v, 0);
    big.forEach(([t, v]) => alloc.set(t, v + (freed * v) / bs));
    notes.push(`Valores abaixo de ${usd(settings.minOrderUsd)} foram redistribuídos (ordem mínima).`);
  }

  // Arredondamento em centavos preservando o total.
  const rounded = roundPreservingTotal(alloc, Math.round(investable * 100) / 100);

  const lines: AllocationLine[] = work.map((w) => {
    const amount = rounded.get(w.a.ticker) ?? 0;
    const value = values[w.a.ticker] ?? 0;
    const tw = w.a.targetWeight / targetSum;
    const normalShare = tw;
    const share = investable > 0 ? amount / investable : 0;
    let action: Action = w.action ?? (amount <= 0 ? "AGUARDAR" : share >= normalShare * 1.15 && (w.a.opportunity.score ?? 50) >= 55 ? "COMPRAR" : "APORTE NORMAL");
    if (amount > 0 && action === "AGUARDAR") action = "APORTE NORMAL";
    const s = w.a.opportunity.score ?? 50;
    const priority: Priority = action === "AGUARDAR" ? "BAIXA" : action === "COMPRAR" || (s >= 62 && w.a.gap > 0) ? "ALTA" : "MÉDIA";
    const { why, favorable, risks, dataUsed } = explain(w.a, action, amount, w.reasons);
    return {
      ticker: w.a.ticker, name: w.a.name, bucket: w.a.strategy.strategy_bucket, amount, share, action, priority,
      opportunityScore: w.a.opportunity.score, currentWeight: w.a.currentWeight, targetWeight: w.a.targetWeight,
      weightAfter: totalAfter > 0 ? ((value + amount) / totalAfter) * 100 : 0,
      gap: w.a.gap, why, favorable, risks, confidence: w.a.confidence.level, blocked: w.blocked, dataUsed,
    };
  });
  const order: Record<Priority, number> = { ALTA: 0, "MÉDIA": 1, BAIXA: 2 };
  lines.sort((x, y) => order[x.priority] - order[y.priority] || y.amount - x.amount || (y.opportunityScore ?? 0) - (x.opportunityScore ?? 0));

  return {
    ...base,
    invested: [...rounded.values()].reduce((a, b) => a + b, 0),
    opportunityCash: Math.round(cash * 100) / 100,
    cashReason,
    lines,
  };
}

function roundPreservingTotal(alloc: Map<string, number>, total: number): Map<string, number> {
  const entries = [...alloc.entries()].filter(([, v]) => v > 0);
  const cents = entries.map(([t, v]) => ({ t, c: Math.floor(v * 100), frac: v * 100 - Math.floor(v * 100) }));
  let diff = Math.round(total * 100) - cents.reduce((s, x) => s + x.c, 0);
  cents.sort((a, b) => b.frac - a.frac);
  for (let i = 0; diff > 0 && cents.length; i = (i + 1) % cents.length, diff--) cents[i].c++;
  return new Map(cents.map((x) => [x.t, x.c / 100]));
}

/** Explicação humana + contra-argumento ("Por que NÃO comprar?"). */
export function explain(a: AssetAnalysis, action: Action, amount: number, ruleReasons: string[]) {
  const sentences: string[] = [];
  const favorable: string[] = [];
  const risks: string[] = [];
  const g = a.gap;
  sentences.push(`${a.ticker} está ${fmt(Math.abs(g), 2)} ponto${Math.abs(g) >= 2 || Math.abs(g) < 1 ? "s" : ""} percentua${Math.abs(g) >= 2 || Math.abs(g) < 1 ? "is" : "l"} ${g >= 0 ? "abaixo" : "acima"} do peso-alvo.`);
  if (g > 0.5) favorable.push(`${fmt(g, 2)} p.p. abaixo do peso-alvo`);
  if (g < -0.5) risks.push(`${fmt(Math.abs(g), 2)} p.p. acima do peso-alvo`);

  const dd = a.drawdown?.from_52w_high;
  if (dd != null && dd <= -5) sentences.push(`O preço recuou ${fmt(Math.abs(dd))}% da máxima de 52 semanas.`);
  if (a.momentum?.ret_1m != null && Math.abs(a.momentum.ret_1m) >= 8) sentences.push(`Variação de ${a.momentum.ret_1m >= 0 ? "+" : ""}${fmt(a.momentum.ret_1m)}% em 1 mês.`);

  const t = a.trend;
  if (t.direction !== "unknown") {
    const move = t.eps_rev_90d ?? t.eps_rev_30d;
    const label = { rising: "subiram", stable: "permaneceram estáveis", falling: "caíram" }[t.direction];
    sentences.push(`As estimativas de EPS ${label}${move !== null ? ` (${move >= 0 ? "+" : ""}${fmt(move)}% em ${t.eps_rev_90d !== null ? "90" : "30"} dias)` : ""}.`);
    if (t.direction === "rising") favorable.push("estimativas de lucro subindo");
    if (t.direction === "stable") favorable.push("estimativas de lucro estáveis");
    if (t.direction === "falling") risks.push("estimativas de lucro em queda");
  } else if (!a.isEtf) {
    risks.push("sem histórico de revisões de estimativas");
  }

  const v = a.valuation;
  if (v.pe_vs_5y !== null) {
    sentences.push(`O P/L está ${fmt(Math.abs(v.pe_vs_5y), 0)}% ${v.pe_vs_5y < 0 ? "abaixo" : "acima"} da média de 5 anos.`);
    (v.pe_vs_5y < 0 ? favorable : risks).push(`P/L ${v.pe_vs_5y < 0 ? "abaixo" : "acima"} da média histórica`);
  }
  if (v.score !== null && v.score < -0.3) risks.push("valuation ainda elevado considerando o crescimento");
  if (v.score !== null && v.score > 0.3) favorable.push("valuation atrativo considerando o crescimento");
  if (a.fairValue.available && a.fairValue.discount_pct !== null) {
    const d = a.fairValue.discount_pct;
    sentences.push(`Preço ${fmt(Math.abs(d))}% ${d < 0 ? "abaixo" : "acima"} do fair value médio estimado (faixa US$${fmt(a.fairValue.min!, 0)}–US$${fmt(a.fairValue.max!, 0)}).`);
  }

  if (a.newsSignal.negative_high.length) {
    sentences.push(`Foram detectadas ${a.newsSignal.negative_high.length} notícia(s) negativa(s) de alta relevância.`);
    risks.push("notícias negativas relevantes recentes");
  } else if (a.newsSignal.count) {
    sentences.push("Não foram detectadas notícias fundamentais negativas de alta relevância.");
  } else {
    sentences.push("Sem notícia recente confiável.");
  }

  for (const s of a.signals) {
    if (s.kind === "VALUATION_COMPRESSION" || s.kind === "OPPORTUNITY") favorable.push(s.title.replace(/^[^A-Za-zÀ-ú]+/, "").toLowerCase());
    if (s.kind === "ANTI_FOMO") risks.push("forte alta recente — risco de perseguir preço");
    if (s.kind === "EARNINGS_SOON") risks.push(`earnings em ${a.daysToEarnings} dia(s)`);
    if (s.kind === "THESIS_DETERIORATION" || s.kind === "THESIS_CHANGE" || s.kind === "CORRECTION_FUNDAMENTAL") risks.push(s.title.replace(/^[^A-Za-zÀ-ú]+/, "").toLowerCase());
    if (s.kind === "STALE_DATA") risks.push("cotação desatualizada");
  }
  if (a.momentum?.volatility_60d != null && a.momentum.volatility_60d > 40) risks.push(`volatilidade alta (${fmt(a.momentum.volatility_60d, 0)}% a.a.)`);
  if (a.momentum?.rsi14 != null && a.momentum.rsi14 > 70) risks.push(`RSI elevado (${fmt(a.momentum.rsi14, 0)})`);
  if (a.isEtf) {
    if (a.ticker === "LQD") risks.push("sensível a juros e a spreads de crédito");
    if (a.ticker === "VNQ") risks.push("sensível a juros e ao ciclo imobiliário");
    if (a.ticker === "JEPQ") risks.push("upside limitado em altas fortes (venda de opções)");
  }

  const verdict =
    action === "AGUARDAR"
      ? `Por isso, o sistema sugere aguardar${ruleReasons.length ? ` (${ruleReasons.join("; ")})` : ""}.`
      : action === "COMPRAR"
        ? `Por isso, o sistema aumentou a prioridade de aporte (${usd(amount)}).`
        : `Por isso, o sistema sugere aporte normal (${usd(amount)})${ruleReasons.length ? `, com ajuste por: ${ruleReasons.join("; ")}` : ""}.`;
  sentences.push(verdict);
  if (!risks.length) risks.push("nenhum risco específico detectado nos dados — isso não elimina riscos de mercado");

  const dataUsed = [
    a.quote ? `Cotação ${a.quote.meta.source} (${a.freshness.label})` : "Cotação indisponível",
    a.fairValue.estimates.length ? `Fair value: ${a.fairValue.estimates.map((e) => e.method).join(", ")}` : null,
    a.trend.basis !== "none" ? `Revisões de EPS (${a.trend.basis === "provider" ? "fornecedor" : "histórico armazenado"})` : null,
    a.sources.length ? `Fontes: ${a.sources.join(", ")}` : null,
  ].filter((x): x is string => !!x);

  return { why: sentences.join(" "), favorable: [...new Set(favorable)], risks: [...new Set(risks)], dataUsed };
}
