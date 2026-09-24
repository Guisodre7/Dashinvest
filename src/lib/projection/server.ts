import "server-only";
import type { SessionUser } from "../auth";
import { getRepo, type Repo } from "../db/repo";
import { getMarketDataProvider } from "../market";
import { computePortfolio } from "../portfolio/calc";
import {
  compareAllocations, compareContributions, extraContribution, sensitivity, simulateAll, stressTest,
  type SensitivityRow,
} from "./engine";
import {
  classOfTicker, DEFAULT_CLASS_WEIGHTS, defaultForm, projectionFormSchema, toInput, toScenarioMap, toStress,
  type ProjectionForm,
} from "./settings";
import { INTL_CLASSES, SCENARIO_KEYS, type IntlClass, type MonthRow, type ScenarioKey, type ScenarioResult } from "./types";

export interface PortfolioPrefill {
  strategicUsd: number | null;
  legacyUsd: number | null;
  usdBrl: number | null;
  usdBrlSource: string | null;
  currentSplit: Record<IntlClass, number> | null;
  classWeightsPct: Record<IntlClass, number>;
  missingPrices: string[];
  holdings: { ticker: string; cls: IntlClass | "legacy"; valueUsd: number }[];
}

/**
 * Dados da carteira real para pré-preencher o simulador: valor da carteira
 * estratégica, posição legada (VOO), divisão atual por classe, pesos-alvo por
 * classe (da estratégia configurada) e câmbio. Nunca inventa: sem preço, o
 * campo fica nulo e o usuário informa manualmente.
 */
export async function loadPrefill(repo: Repo): Promise<PortfolioPrefill> {
  const provider = getMarketDataProvider();
  const [strategy, positions] = await Promise.all([repo.getStrategy(), repo.getPositions()]);
  const held = positions.filter((p) => p.quantity > 0);
  const [quotes, fx] = await Promise.all([
    Promise.all(held.map(async (p) => [p.ticker, (await provider.getQuote(p.ticker).catch(() => null))?.price ?? null] as const)),
    provider.getFxRate("USDBRL").catch(() => null),
  ]);
  const prices = Object.fromEntries(quotes);
  const portfolio = computePortfolio(positions, prices, strategy, [], fx?.rate ?? null);

  // Pesos-alvo por classe a partir da estratégia (fonte única: portfolio_strategy).
  const active = strategy.filter((s) => s.enabled && !s.is_legacy && s.target_weight > 0);
  const tsum = active.reduce((a, s) => a + s.target_weight, 0);
  const classWeightsPct = { growth: 0, jepq: 0, lqd: 0, vnq: 0 } as Record<IntlClass, number>;
  for (const s of active) classWeightsPct[classOfTicker(s.ticker)] += (s.target_weight / tsum) * 100;
  const weightsOk = tsum > 0;
  // Arredonda para 2 casas preservando soma 100.
  if (weightsOk) {
    const keys = INTL_CLASSES;
    const rounded = keys.map((k) => Math.round(classWeightsPct[k] * 100) / 100);
    const diff = Math.round((100 - rounded.reduce((a, b) => a + b, 0)) * 100) / 100;
    rounded[0] = Math.round((rounded[0] + diff) * 100) / 100;
    keys.forEach((k, i) => { classWeightsPct[k] = rounded[i]; });
  }

  const holdings = portfolio.positions
    .filter((p) => p.quantity > 0 && p.valueUsd !== null)
    .map((p) => ({ ticker: p.ticker, cls: p.isLegacy ? "legacy" as const : classOfTicker(p.ticker), valueUsd: p.valueUsd! }));
  const strat = holdings.filter((h) => h.cls !== "legacy");
  const stratSum = strat.reduce((a, h) => a + h.valueUsd, 0);
  let currentSplit: Record<IntlClass, number> | null = null;
  if (stratSum > 0 && portfolio.missingPrices.length === 0) {
    currentSplit = { growth: 0, jepq: 0, lqd: 0, vnq: 0 };
    for (const h of strat) currentSplit[h.cls as IntlClass] += h.valueUsd / stratSum;
  }
  const priced = portfolio.missingPrices.length === 0;
  return {
    strategicUsd: priced ? Math.round(portfolio.strategicUsd * 100) / 100 : null,
    legacyUsd: priced ? Math.round(portfolio.legacyUsd * 100) / 100 : null,
    usdBrl: fx?.rate ?? null,
    usdBrlSource: fx ? `${fx.source} · ${new Date(fx.timestamp).toLocaleString("pt-BR")}` : null,
    currentSplit,
    classWeightsPct: weightsOk ? classWeightsPct : { ...DEFAULT_CLASS_WEIGHTS },
    missingPrices: portfolio.missingPrices,
    holdings,
  };
}

/** Formulário inicial: premissas salvas ou defaults preenchidos com a carteira real. */
export function initialForm(saved: ProjectionForm | null, prefill: PortfolioPrefill): ProjectionForm {
  if (saved) {
    const parsed = projectionFormSchema.safeParse(saved);
    if (parsed.success) return parsed.data;
  }
  return defaultForm({
    initialUsd: prefill.strategicUsd ?? 0,
    initialLegacyUsd: prefill.legacyUsd ?? 0,
    usdBrl: prefill.usdBrl ? Math.round(prefill.usdBrl * 10000) / 10000 : 5.5,
    classWeightsPct: prefill.classWeightsPct,
    useCurrentAllocation: !!prefill.currentSplit,
  });
}

type Series = Pick<MonthRow, "month" | "totalBrl" | "contributedBrl" | "realTotalBrl" | "incomeBrl" | "totalUsd" | "fx">;
export type LiteScenario = Omit<ScenarioResult, "months"> & { months: Series[] };

export interface ProjectionBundle {
  form: ProjectionForm;
  scenarios: Record<ScenarioKey, LiteScenario>;
  contributions: ReturnType<typeof compareContributions>;
  allocations: ReturnType<typeof compareAllocations>;
  sensitivity: SensitivityRow[];
  extra: ReturnType<typeof extraContribution>;
  stress: {
    marketDrop: number;
    maxDrawdown: number;
    bottomMonth: number;
    patrimonyAtBottom: number;
    vsBaseAtMarketBottom: number;
    monthsToRecover: number | null;
    indexRecoveryMonths: number | null;
    finalPatrimony: number;
    baseFinal: number;
    pausedFinal: number;
    contributedDuringDrop: number;
    contributedDuringRecovery: number;
    avgPriceLevelOfShockContributions: number | null;
    keepContributingGain: number;
    vsBase: number;
    series: { month: number; stressed: number; base: number; paused: number; shock: number }[];
  };
  usedCurrentSplit: boolean;
  computedAt: string;
}

const lite = (r: ScenarioResult): LiteScenario => ({
  ...r,
  months: r.months.map((m) => ({ month: m.month, totalBrl: m.totalBrl, contributedBrl: m.contributedBrl, realTotalBrl: m.realTotalBrl, incomeBrl: m.incomeBrl, totalUsd: m.totalUsd, fx: m.fx })),
});

/** Executa toda a projeção no servidor a partir de um formulário JÁ validado. */
export function computeBundle(form: ProjectionForm, currentSplit: Record<IntlClass, number> | null): ProjectionBundle {
  const input = toInput(form, currentSplit);
  const scenarios = toScenarioMap(form);
  const results = simulateAll(input, scenarios);
  const brazilShares = [...new Set([1, 0.6, 0.4, 0.2, 0, input.brazilShare])].sort((a, b) => b - a);
  const st = stressTest(input, scenarios[form.stress.scenario], toStress(form));
  return {
    form,
    scenarios: Object.fromEntries(SCENARIO_KEYS.map((k) => [k, lite(results[k])])) as Record<ScenarioKey, LiteScenario>,
    contributions: compareContributions(input, scenarios, [...new Set([2000, 3000, 4000, 5000, 7000, 10000, form.monthlyContributionBrl])].sort((a, b) => a - b)),
    allocations: compareAllocations(input, scenarios.moderado, brazilShares),
    sensitivity: sensitivity(input, scenarios.moderado),
    extra: extraContribution(input, scenarios),
    stress: {
      marketDrop: st.marketDrop, maxDrawdown: st.maxDrawdown, bottomMonth: st.bottomMonth, patrimonyAtBottom: st.patrimonyAtBottom, vsBaseAtMarketBottom: st.vsBaseAtMarketBottom,
      monthsToRecover: st.monthsToRecover, indexRecoveryMonths: st.indexRecoveryMonths, finalPatrimony: st.finalPatrimony,
      baseFinal: st.base.finalTotalBrl, pausedFinal: st.paused.finalTotalBrl,
      contributedDuringDrop: st.contributedDuringDrop, contributedDuringRecovery: st.contributedDuringRecovery,
      avgPriceLevelOfShockContributions: st.avgPriceLevelOfShockContributions, keepContributingGain: st.keepContributingGain, vsBase: st.vsBase,
      series: st.stressed.months.map((m, i) => ({
        month: m.month, stressed: m.totalBrl, base: st.base.months[i].totalBrl, paused: st.paused.months[i].totalBrl, shock: m.shockLevel,
      })),
    },
    usedCurrentSplit: form.useCurrentAllocation && !!currentSplit,
    computedAt: new Date().toISOString(),
  };
}

export async function getProjectionRepo(user: SessionUser) {
  return getRepo(user.id);
}
