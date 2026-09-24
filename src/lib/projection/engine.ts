import {
  BUCKETS, INTL_CLASSES, SCENARIO_KEYS,
  type Bucket, type IntlClass, type MonthRow, type ProjectionInput, type ReturnYield,
  type ScenarioAssumptions, type ScenarioKey, type ScenarioResult, type StressConfig,
} from "./types";

/**
 * Motor do Simulador Patrimonial — funções puras, executadas no servidor.
 *
 * Modelo mensal (para cada mês):
 *  1. aporte (início ou fim do mês), dividido entre Brasil e exterior;
 *     a parte do exterior é convertida em US$ pelo câmbio do momento e
 *     distribuída pelos pesos das classes;
 *  2. retorno mensal equivalente: (1 + anual)^(1/12) − 1 (juros compostos);
 *  3. o retorno total se divide em valorização (preço) e proventos:
 *     provento do mês = valor × yield/12; valorização = retorno total − provento;
 *  4. proventos reinvestidos voltam ao bucket; não reinvestidos viram caixa em R$
 *     (sem render) — o mesmo dinheiro nunca é contado duas vezes;
 *  5. câmbio atualizado: USD/BRL₀ × (1 + variação anual)^(t/12).
 *
 * Aritmética em ponto flutuante de 64 bits (erro relativo ~1e-15, muito abaixo
 * de 1 centavo para os valores simulados); valores monetários de saída são
 * arredondados em centavos e persistidos como NUMERIC.
 */

export const monthlyRate = (annual: number) => Math.pow(1 + annual, 1 / 12) - 1;
export const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100 + 0; // "+ 0" normaliza -0

export interface SimulateOptions {
  stress?: StressConfig | null;
  /** Multiplicador aleatório do preço por mês/bucket (Monte Carlo). */
  priceShock?: (month: number, bucket: Bucket) => number;
}

function bucketAssumption(a: ScenarioAssumptions, input: ProjectionInput, b: Bucket): ReturnYield {
  if (b === "brazil") return a.brazil;
  if (input.exteriorMode === "single") return a.exterior;
  return a[b];
}

/** Nível do preço no choque: cai geometricamente até o fundo e depois recupera. */
export function stressLevel(month: number, s: StressConfig): number {
  const bottom = 1 - s.drop;
  if (month <= 0) return 1;
  if (month <= s.dropMonths) return Math.pow(bottom, month / s.dropMonths);
  if (s.recoveryMonths === null) return bottom;
  const j = month - s.dropMonths;
  if (j >= s.recoveryMonths) return 1;
  return Math.pow(bottom, 1 - j / s.recoveryMonths);
}

export function simulateScenario(input: ProjectionInput, a: ScenarioAssumptions, opts: SimulateOptions = {}): ScenarioResult {
  const N = Math.max(1, Math.round(input.horizonMonths));
  const stress = opts.stress ?? null;
  const rates = Object.fromEntries(BUCKETS.map((b) => {
    const ry = bucketAssumption(a, input, b);
    return [b, { rm: monthlyRate(ry.ret), ym: ry.yield / 12 }];
  })) as Record<Bucket, { rm: number; ym: number }>;

  const v: Record<Bucket, number> = {
    brazil: input.initialBrl,
    growth: input.initialUsd * input.initialClassSplit.growth,
    jepq: input.initialUsd * input.initialClassSplit.jepq,
    lqd: input.initialUsd * input.initialClassSplit.lqd,
    vnq: input.initialUsd * input.initialClassSplit.vnq,
    legacy: input.initialLegacyUsd,
  };
  const fx0 = input.usdBrl;
  const initialCapitalBrl = input.initialBrl + (input.initialUsd + input.initialLegacyUsd) * fx0;
  let fx = fx0;
  let contributions = 0;
  let cash = 0;
  let incomeTotal = 0, reinvestedTotal = 0;
  let extFactor = 1;
  let fxGain = 0;
  const incomeByYear: number[] = [];
  const rows: MonthRow[] = [];
  const intl = (): number => INTL_CLASSES.reduce((s, c) => s + v[c], 0) + v.legacy;

  const contribute = (brl: number, fxRate: number) => {
    if (brl <= 0) return;
    const br = brl * input.brazilShare;
    const extUsd = (brl - br) / fxRate;
    v.brazil += br;
    for (const c of INTL_CLASSES) v[c] += extUsd * input.classWeights[c];
    contributions += brl;
  };

  for (let t = 1; t <= N; t++) {
    const fxPrev = fx;
    fx = fx0 * Math.pow(1 + a.fxChange, t / 12);
    // Sem recuperação, o contrafactual pausa apenas durante a queda.
    const shockWindow = stress ? stress.dropMonths + (stress.recoveryMonths ?? 0) : 0;
    const paused = !!stress?.pauseContributions && t <= shockWindow;
    const c = paused ? 0 : input.monthlyContributionBrl;

    if (input.contributionTiming === "start") contribute(c, fxPrev);

    const extStartUsd = intl();
    // Efeito cambial sobre a exposição mantida durante o mês.
    fxGain += extStartUsd * (fx - fxPrev);

    let incomeBrl = 0, reinvestedBrl = 0, extIncomeUsd = 0;
    const shockMult = stress ? stressLevel(t, stress) / stressLevel(t - 1, stress) : 1;
    for (const b of BUCKETS) {
      if (v[b] === 0) continue;
      const { rm, ym } = rates[b];
      const income = v[b] * ym;
      let priceFactor = 1 + rm - ym;
      if (stress && stress.buckets.includes(b)) priceFactor *= shockMult;
      if (opts.priceShock) priceFactor *= opts.priceShock(t, b);
      v[b] = Math.max(0, v[b] * priceFactor);
      const inBrl = b === "brazil" ? income : income * fx;
      if (b !== "brazil") extIncomeUsd += income;
      incomeBrl += inBrl;
      if (a.reinvest) {
        v[b] += income;
        reinvestedBrl += inBrl;
      } else {
        cash += inBrl;
      }
    }
    incomeTotal += incomeBrl;
    reinvestedTotal += reinvestedBrl;
    const y = Math.floor((t - 1) / 12);
    incomeByYear[y] = (incomeByYear[y] ?? 0) + incomeBrl;

    // Retorno ponderado no tempo do exterior (em US$), proventos incluídos.
    if (extStartUsd > 0) extFactor *= (intl() + (a.reinvest ? 0 : extIncomeUsd)) / extStartUsd;

    if (input.contributionTiming === "end") contribute(c, fx);

    const extUsd = INTL_CLASSES.reduce((s, k) => s + v[k], 0);
    const exteriorBrl = (extUsd + v.legacy) * fx;
    const totalBrl = v.brazil + exteriorBrl + cash;
    rows.push({
      month: t,
      fx: Math.round(fx * 1e4) / 1e4,
      contributedBrl: round2(initialCapitalBrl + contributions),
      contributionsOnlyBrl: round2(contributions),
      brazilBrl: round2(v.brazil),
      exteriorUsd: round2(extUsd),
      legacyUsd: round2(v.legacy),
      exteriorBrl: round2(exteriorBrl),
      incomeCashBrl: round2(cash),
      totalBrl: round2(totalBrl),
      totalUsd: round2(totalBrl / fx),
      realTotalBrl: round2(totalBrl / Math.pow(1 + a.inflation, t / 12)),
      incomeBrl: round2(incomeBrl),
      reinvestedBrl: round2(reinvestedBrl),
      shockLevel: stress ? stressLevel(t, stress) : 1,
    });
  }

  const last = rows[rows.length - 1];
  const finalTotal = v.brazil + (INTL_CLASSES.reduce((s, k) => s + v[k], 0) + v.legacy) * fx + cash;
  const growth = finalTotal - initialCapitalBrl - contributions;
  const tail = rows.slice(-12);
  const lastYearIncome = tail.reduce((s, r) => s + r.incomeBrl, 0) * (12 / tail.length);
  const capital = initialCapitalBrl + contributions;
  const fxReturn = fx / fx0 - 1;
  return {
    months: rows,
    finalTotalBrl: round2(finalTotal),
    finalTotalUsd: round2(finalTotal / fx),
    finalRealBrl: last.realTotalBrl,
    initialCapitalBrl: round2(initialCapitalBrl),
    contributionsBrl: round2(contributions),
    growthBrl: round2(growth),
    incomeTotalBrl: round2(incomeTotal),
    reinvestedTotalBrl: round2(reinvestedTotal),
    notReinvestedTotalBrl: round2(incomeTotal - reinvestedTotal),
    incomeByYear: incomeByYear.map(round2),
    lastYearIncomeBrl: round2(lastYearIncome),
    yieldOnPatrimony: finalTotal > 0 ? lastYearIncome / finalTotal : 0,
    yieldOnCapital: capital > 0 ? lastYearIncome / capital : 0,
    exteriorAssetReturn: extFactor - 1,
    fxReturn,
    exteriorTotalReturnBrl: extFactor * (1 + fxReturn) - 1,
    assetGainBrl: round2(growth - fxGain),
    fxGainBrl: round2(fxGain),
    finalExteriorShare: finalTotal > 0 ? (last.exteriorBrl) / finalTotal : 0,
  };
}

export function simulateAll(input: ProjectionInput, scenarios: Record<ScenarioKey, ScenarioAssumptions>) {
  return Object.fromEntries(SCENARIO_KEYS.map((k) => [k, simulateScenario(input, scenarios[k])])) as Record<ScenarioKey, ScenarioResult>;
}

// ---------------------------------------------------------------------------
// Comparadores
// ---------------------------------------------------------------------------

export function compareContributions(input: ProjectionInput, scenarios: Record<ScenarioKey, ScenarioAssumptions>, amounts: number[]) {
  return amounts.map((amount) => {
    const i = { ...input, monthlyContributionBrl: amount };
    const r = Object.fromEntries(SCENARIO_KEYS.map((k) => [k, simulateScenario(i, scenarios[k])])) as Record<ScenarioKey, ScenarioResult>;
    return {
      amount,
      contributions: r.moderado.contributionsBrl,
      final: { pessimista: r.pessimista.finalTotalBrl, moderado: r.moderado.finalTotalBrl, otimista: r.otimista.finalTotalBrl },
      growth: r.moderado.growthBrl,
      income: r.moderado.lastYearIncomeBrl,
    };
  });
}

export function compareAllocations(input: ProjectionInput, a: ScenarioAssumptions, brazilShares: number[]) {
  return brazilShares.map((share) => {
    const r = simulateScenario({ ...input, brazilShare: share }, a);
    return {
      brazilShare: share,
      contributions: r.contributionsBrl,
      final: r.finalTotalBrl,
      growth: r.growthBrl,
      annualIncome: r.lastYearIncomeBrl,
      exteriorShareFinal: r.finalExteriorShare,
      fxGain: r.fxGainBrl,
    };
  });
}

export interface SensitivityRow {
  key: string;
  label: string;
  from: string;
  to: string;
  final: number;
  delta: number;
  note?: string;
}

/** Variação do patrimônio final (cenário base) ao alterar uma premissa por vez. */
export function sensitivity(input: ProjectionInput, a: ScenarioAssumptions): SensitivityRow[] {
  const base = simulateScenario(input, a).finalTotalBrl;
  const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
  const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  const bump = (ry: ReturnYield, d: number): ReturnYield => ({ ...ry, ret: ry.ret + d });
  const allReturns = (d: number): ScenarioAssumptions => ({
    ...a, brazil: bump(a.brazil, d), exterior: bump(a.exterior, d), growth: bump(a.growth, d),
    jepq: bump(a.jepq, d), lqd: bump(a.lqd, d), vnq: bump(a.vnq, d), legacy: bump(a.legacy, d),
  });
  const allYields = (d: number): ScenarioAssumptions => {
    const y = (ry: ReturnYield): ReturnYield => ({ ...ry, yield: Math.max(0, ry.yield + d) });
    return { ...a, brazil: y(a.brazil), exterior: y(a.exterior), growth: y(a.growth), jepq: y(a.jepq), lqd: y(a.lqd), vnq: y(a.vnq), legacy: y(a.legacy) };
  };
  const extShare = 1 - input.brazilShare;
  const newExt = Math.min(1, extShare + 0.1);
  const rows: Omit<SensitivityRow, "delta">[] = [
    { key: "aporte", label: "Aporte mensal", from: brl(input.monthlyContributionBrl), to: brl(input.monthlyContributionBrl + 1000), final: simulateScenario({ ...input, monthlyContributionBrl: input.monthlyContributionBrl + 1000 }, a).finalTotalBrl },
    { key: "retorno", label: "Retorno de todas as classes", from: "premissa", to: "+1 p.p. a.a.", final: simulateScenario(input, allReturns(0.01)).finalTotalBrl },
    { key: "horizonte", label: "Horizonte", from: `${input.horizonMonths} meses`, to: `${input.horizonMonths + 12} meses`, final: simulateScenario({ ...input, horizonMonths: input.horizonMonths + 12 }, a).finalTotalBrl },
    { key: "cambio", label: "Variação anual do dólar", from: pct(a.fxChange), to: pct(a.fxChange + 0.02), final: simulateScenario(input, { ...a, fxChange: a.fxChange + 0.02 }).finalTotalBrl },
    {
      key: "yield", label: "Yield de proventos", from: "premissa", to: "+1 p.p. a.a.", final: simulateScenario(input, allYields(0.01)).finalTotalBrl,
      note: a.reinvest ? "Com reinvestimento, o yield só muda a composição do retorno total (premissa fixa) — impacto ≈ 0." : "Sem reinvestimento, mais yield = mais caixa e menos valorização.",
    },
    { key: "exterior", label: "Percentual no exterior", from: pct(extShare), to: pct(newExt), final: simulateScenario({ ...input, brazilShare: 1 - newExt }, a).finalTotalBrl },
  ];
  return rows.map((r) => ({ ...r, delta: round2(r.final - base) }));
}

/** "E se eu investir R$1.000 a mais por mês?" */
export function extraContribution(input: ProjectionInput, scenarios: Record<ScenarioKey, ScenarioAssumptions>, extra = 1000, horizons = [36, 60, 120, 180]) {
  return horizons.map((h) => {
    const base = { ...input, horizonMonths: h };
    const more = { ...base, monthlyContributionBrl: input.monthlyContributionBrl + extra };
    const delta = Object.fromEntries(SCENARIO_KEYS.map((k) => [
      k, round2(simulateScenario(more, scenarios[k]).finalTotalBrl - simulateScenario(base, scenarios[k]).finalTotalBrl),
    ])) as Record<ScenarioKey, number>;
    return { months: h, extraContributed: extra * h, delta };
  });
}

// ---------------------------------------------------------------------------
// Stress test
// ---------------------------------------------------------------------------

export interface StressResult {
  base: ScenarioResult;
  stressed: ScenarioResult;
  paused: ScenarioResult;
  marketDrop: number;
  /** Maior queda do patrimônio total (pico → vale), aportes incluídos. */
  maxDrawdown: number;
  bottomMonth: number;
  patrimonyAtBottom: number;
  /** No fundo do mercado: patrimônio com queda ÷ sem queda − 1 (isola o choque dos aportes). */
  vsBaseAtMarketBottom: number;
  /** Meses até o patrimônio superar o pico anterior à queda; null = não recuperou no horizonte. */
  monthsToRecover: number | null;
  /** Meses até o índice de preço voltar ao nível pré-queda (premissa). */
  indexRecoveryMonths: number | null;
  finalPatrimony: number;
  contributedDuringDrop: number;
  contributedDuringRecovery: number;
  /** Nível médio de preço pago pelos aportes feitos com o índice abaixo de 1 (1 = pré-queda). */
  avgPriceLevelOfShockContributions: number | null;
  /** Diferença final: continuar aportando vs pausar aportes durante a crise. */
  keepContributingGain: number;
  vsBase: number;
}

export function stressTest(input: ProjectionInput, a: ScenarioAssumptions, s: StressConfig): StressResult {
  const base = simulateScenario(input, a);
  const stressed = simulateScenario(input, a, { stress: { ...s, pauseContributions: false } });
  const paused = simulateScenario(input, a, { stress: { ...s, pauseContributions: true } });
  const m = stressed.months;

  let peak = stressed.initialCapitalBrl, peakBeforeBottom = peak, maxDd = 0, bottomMonth = 0, bottomValue = peak;
  for (const r of m) {
    if (r.totalBrl > peak) peak = r.totalBrl;
    const dd = peak > 0 ? r.totalBrl / peak - 1 : 0;
    if (dd < maxDd) { maxDd = dd; bottomMonth = r.month; bottomValue = r.totalBrl; peakBeforeBottom = peak; }
  }
  const recovered = bottomMonth ? m.find((r) => r.month > bottomMonth && r.totalBrl >= peakBeforeBottom) : null;
  // Sem queda do patrimônio (aportes compensaram): reporta o valor no fundo do mercado.
  const marketBottom = Math.min(s.dropMonths, m.length);
  if (!bottomMonth) { bottomMonth = marketBottom; bottomValue = m[marketBottom - 1].totalBrl; }
  const baseAtBottom = base.months[marketBottom - 1].totalBrl;

  const window = s.recoveryMonths === null ? m.length : s.dropMonths + s.recoveryMonths;
  const c = input.monthlyContributionBrl;
  const inDrop = Math.min(s.dropMonths, m.length);
  const inRecovery = Math.max(0, Math.min(window, m.length) - s.dropMonths);
  // Preço médio pago nos meses com índice abaixo do nível pré-queda.
  const shockMonths = m.filter((r) => r.shockLevel < 0.9999);
  const avgLevel = shockMonths.length && c > 0
    ? shockMonths.reduce((acc, r) => acc + r.shockLevel, 0) / shockMonths.length
    : null;

  return {
    base, stressed, paused,
    marketDrop: s.drop,
    maxDrawdown: maxDd,
    bottomMonth,
    patrimonyAtBottom: round2(bottomValue),
    vsBaseAtMarketBottom: baseAtBottom > 0 ? m[marketBottom - 1].totalBrl / baseAtBottom - 1 : 0,
    monthsToRecover: maxDd === 0 ? 0 : recovered ? recovered.month : null,
    indexRecoveryMonths: s.recoveryMonths === null ? null : s.dropMonths + s.recoveryMonths,
    finalPatrimony: stressed.finalTotalBrl,
    contributedDuringDrop: round2(c * inDrop),
    contributedDuringRecovery: round2(c * inRecovery),
    avgPriceLevelOfShockContributions: avgLevel,
    keepContributingGain: round2(stressed.finalTotalBrl - paused.finalTotalBrl - (stressed.contributionsBrl - paused.contributionsBrl)),
    vsBase: round2(stressed.finalTotalBrl - base.finalTotalBrl),
  };
}

// ---------------------------------------------------------------------------
// Monte Carlo — arquitetura preparada (não exibido na UI nesta etapa)
// ---------------------------------------------------------------------------

/** Gerador determinístico (mulberry32) para simulações reprodutíveis. */
export function seededRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rand: () => number) {
  const u = Math.max(rand(), 1e-12), w = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w);
}

export interface MonteCarloOptions {
  runs: number;
  /** Volatilidade anual por bucket (premissa do usuário). */
  volatility: Record<Bucket, number>;
  seed?: number;
}

/**
 * Simulações com choques lognormais de média 1 aplicados sobre o retorno de
 * cada cenário (o retorno esperado da premissa é preservado).
 */
export function simulateMonteCarlo(input: ProjectionInput, a: ScenarioAssumptions, opts: MonteCarloOptions): number[] {
  const rand = seededRandom(opts.seed ?? 42);
  const out: number[] = [];
  const sig = Object.fromEntries(BUCKETS.map((b) => [b, opts.volatility[b] / Math.sqrt(12)])) as Record<Bucket, number>;
  for (let i = 0; i < opts.runs; i++) {
    const r = simulateScenario(input, a, {
      priceShock: (_t, b) => (sig[b] > 0 ? Math.exp(sig[b] * normal(rand) - (sig[b] * sig[b]) / 2) : 1),
    });
    out.push(r.finalTotalBrl);
  }
  return out;
}

/** Percentis por interpolação linear (P10, P25, P50, P75, P90…). */
export function calculatePercentiles(values: number[], percentiles = [10, 25, 50, 75, 90]): Record<number, number> {
  const sorted = [...values].sort((x, y) => x - y);
  const res: Record<number, number> = {};
  for (const p of percentiles) {
    if (!sorted.length) { res[p] = NaN; continue; }
    const idx = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    res[p] = sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }
  return res;
}

export type { IntlClass };
