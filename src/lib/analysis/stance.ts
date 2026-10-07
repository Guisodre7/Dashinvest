/**
 * Camada de decisão: QUALIDADE do ativo + VALOR (faixa de valuation) + PREÇO
 * PAGO + TESE + CONCENTRAÇÃO → uma postura única, usada em todas as telas
 * e notificações. Funções puras.
 *
 * Princípios:
 *  - variação de preço ≠ valuation: a faixa vem do preço contra o valor justo
 *    estimado (intervalo, nunca número exato);
 *  - "barata" não é oportunidade se a qualidade é fraca ou a tese deteriorou;
 *  - "cara" não é "vender tudo": a estratégia padrão para empresa excelente
 *    esticada é realização PARCIAL, e só quando a posição pesa na carteira;
 *  - custos e impostos podem tornar a venda ineficiente;
 *  - nada é ordem: tudo é faixa sugerida para avaliação.
 */

export type QualityLevel = "excelente" | "boa" | "mediana" | "fraca" | "sem dados";
export type ThesisState = "intacta" | "em observação" | "deteriorada" | "não verificável";
export type BandKey = "forte" | "atrativo" | "justo" | "esticado" | "extremo";
export type ActionKey = "comprar" | "recompra" | "manter" | "nao_aumentar" | "realizacao" | "reduzir" | "evitar" | "sair" | "aguardar" | "legado";

export const ACTION_META: Record<ActionKey, { label: string; emoji: string; group: "comprar" | "manter" | "realizar" | "recomprar" | "evitar" | "aguardar" }> = {
  comprar: { label: "Oportunidade / compra", emoji: "🟢", group: "comprar" },
  recompra: { label: "Recompra potencial", emoji: "🟢", group: "recomprar" },
  manter: { label: "Manter", emoji: "🟢", group: "manter" },
  nao_aumentar: { label: "Manter / não aumentar", emoji: "🟡", group: "manter" },
  realizacao: { label: "Realização parcial", emoji: "🟠", group: "realizar" },
  reduzir: { label: "Reduzir significativamente", emoji: "🔴", group: "realizar" },
  evitar: { label: "Evitar aumentar", emoji: "🔴", group: "evitar" },
  sair: { label: "Sair da tese (avaliar)", emoji: "⚫", group: "evitar" },
  aguardar: { label: "Aguardar dados", emoji: "⚪", group: "aguardar" },
  legado: { label: "Posição legada — manter", emoji: "⚪", group: "manter" },
};

export const BAND_META: Record<BandKey, { label: string; emoji: string }> = {
  forte: { label: "Atrativo (compra forte)", emoji: "🟢" },
  atrativo: { label: "Atrativo", emoji: "🟢" },
  justo: { label: "Preço justo / razoável", emoji: "🟡" },
  esticado: { label: "Esticado", emoji: "🟠" },
  extremo: { label: "Extremamente esticado", emoji: "🔴" },
};

/** Limites relativos ao valor justo médio: < 0,85 | 0,85–0,95 | 0,95–1,05 | 1,05–1,25 | > 1,25. */
export const BAND_LIMITS: [number, number, number, number] = [0.85, 0.95, 1.05, 1.25];

export interface TaxRules {
  /** Custo fixo por ordem (moeda do ativo). */
  feePerOrder: number;
  /** Alíquota sobre o ganho (0–1). */
  gainTaxRate: number;
  /** Isenção mensal por volume de vendas (ex.: ações BR até R$ 20 mil/mês); null = sem isenção. */
  monthlyExemption: number | null;
  /** Ordem mínima que faz sentido. */
  minTicket: number;
  note: string;
}

export const DEFAULT_TAX: Record<"US" | "BR_ACAO" | "BR_FII", TaxRules> = {
  US: { feePerOrder: 1, gainTaxRate: 0.15, monthlyExemption: null, minTicket: 100, note: "Exterior (Lei 14.754/2023): 15% sobre o ganho em reais, apurado na declaração anual. Confirme a regra vigente com seu contador." },
  BR_ACAO: { feePerOrder: 0, gainTaxRate: 0.15, monthlyExemption: 20000, minTicket: 500, note: "Ações BR (swing trade): 15% sobre o ganho; vendas até R$ 20 mil/mês isentas. Confirme a regra vigente." },
  BR_FII: { feePerOrder: 0, gainTaxRate: 0.2, monthlyExemption: null, minTicket: 500, note: "FIIs: 20% sobre o ganho de capital, sem isenção. Confirme a regra vigente." },
};

export type FairBasis = "fair-value" | "historical-multiple" | "graham-bazin" | "patrimonial";
const BASIS_LABEL: Record<FairBasis, string> = {
  "fair-value": "faixa multi-fonte",
  "historical-multiple": "múltiplo histórico, confiança menor",
  "graham-bazin": "lucro, dividendos e juros",
  patrimonial: "valor patrimonial por cota (P/VP = 1)",
};

export interface StanceInput {
  ticker: string;
  isEtf: boolean;
  isLegacy: boolean;
  price: number | null;
  /** Valor justo estimado (intervalo) — de fair value multi-fonte ou múltiplo histórico. */
  fair: { low: number | null; mean: number; high: number | null; basis: FairBasis } | null;
  qualityScore: number | null;
  qualityCoverage: number;
  /** Sinais do motor de análise (THESIS_CHANGE, ...). */
  signalKinds: string[];
  estimates: { direction: "rising" | "stable" | "falling" | "unknown"; significantCut: boolean; epsRev90d: number | null };
  priceChange6m: number | null;
  /** Peso na carteira estratégica, meta e máximo (p.p.). */
  weight: number | null;
  target: number;
  maxWeight: number | null;
  position: { quantity: number; avgCost: number; value: number } | null;
  /** Última venda (para recompra). */
  lastSell: { date: string; price: number; quantity: number } | null;
  tax: TaxRules;
  currency: "US$" | "R$";
  /** Sinal dos analistas (-1..+1): revisões de lucro e mudança de recomendação. */
  analystScore?: number | null;
  /** Analistas muito divergentes ou base fraca: exige mais desconto para comprar. */
  uncertain?: boolean;
  /** DCF reverso: crescimento embutido no preço − crescimento base da empresa (fração). */
  impliedGap?: number | null;
}

/** Com incerteza alta, a faixa de compra exige mais desconto. */
const UNCERTAIN_LIMITS: [number, number, number, number] = [0.8, 0.92, 1.05, 1.25];

export interface Band { key: BandKey; low: number | null; high: number | null }

export interface Stance {
  ticker: string;
  quality: QualityLevel;
  thesis: ThesisState;
  band: BandKey | null;
  bands: Band[];
  /** preço / valor justo médio − 1 (%). */
  premiumPct: number | null;
  action: ActionKey;
  headline: string;
  reasons: string[];
  /** "Alta acompanhada pelos fundamentos" × "preço mais rápido que os fundamentos". */
  rally: "justificada" | "expectativa" | null;
  /** Excelente e só um pouco cara: aporte normal reduzido (não é oportunidade). */
  qualityPremium?: boolean;
  realization: null | {
    pctLow: number; pctHigh: number; sharesLow: number; sharesHigh: number; valueLow: number; valueHigh: number;
    estGain: number; estTax: number; fees: number; efficient: boolean; note: string;
  };
  rebuy: null | {
    sellPrice: number; sellDate: string; soldQty: number; dropFromSellPct: number;
    ladder: { label: string; low: number | null; high: number | null; pctOfSold: number }[];
    impact: { qty: number; cost: number; newAvg: number | null };
  };
}

export function qualityLevel(score: number | null, coverage: number, isEtf: boolean): QualityLevel {
  if (isEtf || score === null || coverage < 0.4) return "sem dados";
  return score >= 75 ? "excelente" : score >= 60 ? "boa" : score >= 45 ? "mediana" : "fraca";
}

export function thesisState(signalKinds: string[], est: StanceInput["estimates"]): ThesisState {
  if (signalKinds.some((k) => k === "THESIS_CHANGE" || k === "THESIS_DETERIORATION" || k === "CORRECTION_FUNDAMENTAL") || est.significantCut) return "deteriorada";
  if (est.direction === "falling" || signalKinds.includes("CORRECTION_INCONCLUSIVE")) return "em observação";
  if (est.direction === "unknown") return "não verificável";
  return "intacta";
}

export function valuationBands(mean: number, limits = BAND_LIMITS): Band[] {
  const [a, b, c, d] = limits.map((x) => x * mean);
  return [
    { key: "forte", low: null, high: a }, { key: "atrativo", low: a, high: b }, { key: "justo", low: b, high: c },
    { key: "esticado", low: c, high: d }, { key: "extremo", low: d, high: null },
  ];
}

export function bandOf(price: number, mean: number, L = BAND_LIMITS): BandKey {
  const r = price / mean;
  return r < L[0] ? "forte" : r < L[1] ? "atrativo" : r <= L[2] ? "justo" : r <= L[3] ? "esticado" : "extremo";
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const fmt = (v: number, d = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

export function computeStance(i: StanceInput): Stance {
  const quality = qualityLevel(i.qualityScore, i.qualityCoverage, i.isEtf);
  const thesis = thesisState(i.signalKinds, i.estimates);
  const reasons: string[] = [];
  const base = { ticker: i.ticker, quality, thesis, bands: [] as Band[], band: null as BandKey | null, premiumPct: null as number | null, rally: null as Stance["rally"], realization: null, rebuy: null };

  if (i.isLegacy) {
    return { ...base, action: "legado", headline: "Posição legada (Anchor): monitorada, fora de sugestões de compra e de venda.", reasons: ["Definida como legado na estratégia."] };
  }
  if (!i.price || !i.fair) {
    return { ...base, action: "aguardar", headline: "Dados insuficientes para uma faixa de valuation confiável.", reasons: [i.isEtf ? "ETF: sem valor justo multi-fonte; acompanhe yield, composição e custos." : "Sem valor justo estimado com pelo menos 2 métodos (ou múltiplo histórico)."] };
  }

  const limits = i.uncertain ? UNCERTAIN_LIMITS : BAND_LIMITS;
  const bands = valuationBands(i.fair.mean, limits);
  const band = bandOf(i.price, i.fair.mean, limits);
  const premiumPct = (i.price / i.fair.mean - 1) * 100;
  reasons.push(`Preço ${fmt(Math.abs(premiumPct), 1)}% ${premiumPct >= 0 ? "acima" : "abaixo"} do valor justo médio estimado (${BASIS_LABEL[i.fair.basis]}).`);

  // Alta: acompanhada pelos fundamentos ou só expectativa?
  let rally: Stance["rally"] = null;
  if (i.priceChange6m !== null && i.priceChange6m >= 15) {
    const rev = i.estimates.epsRev90d;
    if (rev !== null && rev >= 3 && i.estimates.direction === "rising") rally = "justificada";
    else if (rev === null || rev <= 1) rally = "expectativa";
    if (rally === "justificada") reasons.push(`Alta de ${fmt(i.priceChange6m, 0)}% em 6 meses acompanhada por revisão de lucro (${fmt(rev!, 1)}% em 90 dias).`);
    if (rally === "expectativa") reasons.push(`⚠️ Preço avançou ${fmt(i.priceChange6m, 0)}% em 6 meses, mais rápido que os fundamentos observáveis (revisão de lucro ${rev === null ? "indisponível" : `${fmt(rev, 1)}%`}). Reavaliar risco/retorno.`);
  }

  const held = !!i.position && i.position.quantity > 0;
  const aboveTarget = i.weight !== null && i.weight > i.target;
  const good = quality === "excelente" || quality === "boa";
  let action: ActionKey;
  let headline: string;
  let qualityPremium = false;

  if (thesis === "deteriorada") {
    if (held && (quality === "fraca" || quality === "mediana")) {
      action = "sair"; headline = "Fundamentos em deterioração e qualidade abaixo do ideal: avaliar se a tese ainda se sustenta.";
    } else {
      action = "evitar";
      headline = band === "forte" || band === "atrativo"
        ? "Preço baixo, mas com sinais de deterioração: não confundir preço baixo com oportunidade."
        : "Sinais de deterioração da tese: não aumentar a posição.";
    }
  } else if (band === "extremo") {
    // Venda só por preço (bem acima do valor justo), nunca só para reequilibrar.
    if (!held) { action = "evitar"; headline = "Valuation extremamente esticado: não é ponto de entrada."; }
    else if (rally === "justificada") { action = "nao_aumentar"; headline = "Preço bem acima do valor justo, mas a alta vem acompanhada de lucros subindo: manter sem aumentar e reavaliar no próximo resultado."; }
    else if (good) { action = "realizacao"; headline = `Empresa continua boa, mas o preço está ${fmt(premiumPct, 0)}% acima do valor justo: avaliar vender uma parte e recomprar mais barato.`; }
    else if (quality !== "sem dados") { action = "reduzir"; headline = `Preço ${fmt(premiumPct, 0)}% acima do valor justo com qualidade apenas mediana/fraca: avaliar redução relevante.`; }
    else { action = "nao_aumentar"; headline = "Valuation extremamente esticado, sem dados de qualidade para sugerir venda: manter sem aumentar."; }
  } else if (band === "esticado" && quality === "excelente" && (thesis === "intacta" || thesis === "não verificável") && (i.analystScore ?? 0) > -0.2 && (i.impliedGap ?? 0) <= 0.08) {
    // Empresa excelente um pouco acima do valor justo: esperar "o preço certo" pode significar
    // nunca comprar um bom compositor. Aporte normal e menor (não é oportunidade).
    action = "manter"; qualityPremium = true;
    headline = `Empresa excelente ${fmt(premiumPct, 0)}% acima do valor justo: aporte menor e constante, para não perder o crescimento de longo prazo (não é oportunidade).`;
  } else if (band === "esticado") {
    // Um pouco acima do valor justo: não compra mais, mas também não vende (jogo de longo prazo).
    action = "nao_aumentar"; headline = rally === "justificada" ? "A alta parece acompanhada por melhora dos fundamentos, mas o preço já está acima do valor justo: manter sem aumentar." : "Empresa pode ser boa, mas o preço está acima do valor justo: manter sem aumentar (não vender por isso).";
  } else if (band === "justo") {
    action = "manter"; headline = aboveTarget ? "Preço razoável; posição acima da meta — aportes podem ir para outros ativos." : "Preço razoável: pode manter e aportar normalmente.";
  } else {
    // forte / atrativo
    if (quality === "fraca") { action = "evitar"; headline = "Barata, mas a qualidade do negócio é fraca: preço baixo não torna uma empresa boa."; }
    else if (thesis === "em observação") { action = "nao_aumentar"; headline = "Valuation atrativo, porém estimativas em queda: acompanhar antes de aumentar."; }
    else if (i.lastSell && i.price < i.lastSell.price && good) { action = "recompra"; headline = "Os fundamentos permanecem preservados e o valuation voltou para uma faixa atrativa: recompra parcial possível."; }
    else if (good || quality === "sem dados") { action = "comprar"; headline = band === "forte" ? "Qualidade + valuation com margem de segurança: faixa de compra forte." : "Qualidade com valuation atrativo: faixa interessante para aporte."; }
    else { action = "manter"; headline = "Valuation atrativo e qualidade mediana: compra normal, sem exagero."; }
  }

  // Confirmações antes de chamar de oportunidade: analistas e expectativa embutida no preço.
  const buying = action === "comprar" || action === "recompra";
  if (buying && (i.analystScore ?? 0) <= -0.4) {
    action = "nao_aumentar"; headline = "Preço atrativo, mas os analistas estão cortando lucro/recomendação: esperar estabilizar antes de aumentar.";
  } else if (buying && (i.impliedGap ?? 0) > 0.08) {
    action = "manter"; headline = "Abaixo do valor justo pelos múltiplos, mas o preço ainda embute crescimento acima do histórico: aporte normal, sem pressa.";
  }

  let realization: Stance["realization"] = null;
  if ((action === "realizacao" || action === "reduzir") && i.position && i.weight !== null) {
    const pos = i.position;
    // Tamanho pela distância do valor justo — o peso na carteira não decide venda.
    const [lo, hi] = action === "reduzir" ? [20, 35] : premiumPct > 50 ? [20, 30] : [10, 20];
    const shares = (p: number) => Math.floor(pos.quantity * p / 100 * 1e4) / 1e4;
    const valueHigh = r2(shares(hi) * i.price);
    const gainPerShare = i.price - pos.avgCost;
    const estGain = r2(Math.max(0, gainPerShare) * shares(hi));
    const exempt = i.tax.monthlyExemption !== null && valueHigh <= i.tax.monthlyExemption;
    const estTax = exempt ? 0 : r2(estGain * i.tax.gainTaxRate);
    const fees = i.tax.feePerOrder;
    const efficient = hi > 0 && valueHigh >= i.tax.minTicket && (estTax + fees) / Math.max(valueHigh, 1) <= 0.1;
    const note = !efficient
      ? `Venda pequena demais ou custos/impostos altos (${i.currency} ${fmt(estTax + fees)} sobre ${i.currency} ${fmt(valueHigh)}): manter sem aumentar é mais eficiente.`
      : `Faixa sugerida para avaliação, não ordem. Imposto estimado ${i.currency} ${fmt(estTax)}${exempt ? " (dentro da isenção mensal)" : ""} + custos ${i.currency} ${fmt(fees)}. ${i.tax.note}`;
    realization = { pctLow: lo, pctHigh: hi, sharesLow: shares(lo), sharesHigh: shares(hi), valueLow: r2(shares(lo) * i.price), valueHigh, estGain, estTax, fees, efficient, note };
    if (!efficient) { action = "nao_aumentar"; reasons.push(note); }
  }

  let rebuy: Stance["rebuy"] = null;
  if (i.lastSell) {
    const s = i.lastSell;
    const m = i.fair.mean;
    const ladder = [
      { label: "Recompra forte", low: null, high: r2(m * limits[0]), pctOfSold: 40 },
      { label: "Recompra normal", low: r2(m * limits[0]), high: r2(m * limits[1]), pctOfSold: 35 },
      { label: "Recompra parcial", low: r2(m * limits[1]), high: r2(m), pctOfSold: 25 },
      { label: "Aguardar", low: r2(m), high: r2(m * limits[2]), pctOfSold: 0 },
      { label: "Ainda esticado", low: r2(m * limits[2]), high: null, pctOfSold: 0 },
    ];
    const step = ladder.find((l) => (l.low === null || i.price! >= l.low) && (l.high === null || i.price! < l.high)) ?? ladder[ladder.length - 1];
    const qty = Math.floor(s.quantity * step.pctOfSold / 100 * 1e4) / 1e4;
    const cost = r2(qty * i.price);
    const newAvg = i.position && qty > 0 ? r2((i.position.quantity * i.position.avgCost + cost) / (i.position.quantity + qty)) : null;
    rebuy = { sellPrice: s.price, sellDate: s.date, soldQty: s.quantity, dropFromSellPct: (i.price / s.price - 1) * 100, ladder, impact: { qty, cost, newAvg } };
  }

  if (quality !== "sem dados") reasons.push(`Qualidade do negócio: ${quality}.`);
  reasons.push(thesis === "não verificável"
    ? "Tese: não verificável automaticamente (sem estimativas de lucro na fonte gratuita) — confira resultados e notícias antes de decidir."
    : `Tese: ${thesis}.`);
  if (i.weight !== null) reasons.push(`Peso atual ${fmt(i.weight, 1)}% · meta ${fmt(i.target, 1)}%${i.maxWeight !== null ? ` · máximo ${fmt(i.maxWeight, 1)}%` : ""}.`);
  return { ...base, bands, band, premiumPct, action, headline, reasons, rally, realization, rebuy, qualityPremium };
}
