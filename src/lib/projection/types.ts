/**
 * Tipos do Simulador Patrimonial. Todas as taxas são anuais em fração
 * (0,08 = 8% a.a.). Valores monetários em unidades da moeda indicada.
 * As taxas são PREMISSAS configuráveis — nunca previsões.
 */

export type ScenarioKey = "pessimista" | "moderado" | "otimista";
export const SCENARIO_KEYS: ScenarioKey[] = ["pessimista", "moderado", "otimista"];

/** Classes internacionais do modelo + posição legada (VOO). */
export type IntlClass = "growth" | "jepq" | "lqd" | "vnq";
export const INTL_CLASSES: IntlClass[] = ["growth", "jepq", "lqd", "vnq"];
export type Bucket = "brazil" | IntlClass | "legacy";
export const BUCKETS: Bucket[] = ["brazil", "growth", "jepq", "lqd", "vnq", "legacy"];

export interface ReturnYield {
  /** Retorno TOTAL anual esperado (valorização + proventos). */
  ret: number;
  /** Parte do retorno total paga como dividendo/distribuição (yield anual). */
  yield: number;
}

export interface ScenarioAssumptions {
  brazil: ReturnYield;
  /** Taxa única do exterior (usada quando exteriorMode = "single"). */
  exterior: ReturnYield;
  growth: ReturnYield;
  jepq: ReturnYield;
  lqd: ReturnYield;
  vnq: ReturnYield;
  /** Posição legada (VOO): monitorada, sem aportes. */
  legacy: ReturnYield;
  /** Inflação anual (BRL) — usada para valores em poder de compra de hoje. */
  inflation: number;
  /** Variação anual do USD/BRL (+ = dólar valoriza). */
  fxChange: number;
  /** Reinvestir dividendos/distribuições. */
  reinvest: boolean;
}

export interface ProjectionInput {
  /** Patrimônio inicial no Brasil (R$). */
  initialBrl: number;
  /** Patrimônio inicial no exterior, carteira estratégica (US$). */
  initialUsd: number;
  /** Posição legada/Anchor (VOO) em US$ — não recebe aportes. */
  initialLegacyUsd: number;
  /** Aporte mensal em R$. */
  monthlyContributionBrl: number;
  horizonMonths: number;
  /** Fração do aporte destinada ao Brasil (0–1); o restante vai ao exterior. */
  brazilShare: number;
  /** USD/BRL inicial (R$ por US$1). */
  usdBrl: number;
  contributionTiming: "start" | "end";
  /** "classes": premissas por classe; "single": uma taxa para todo o exterior. */
  exteriorMode: "classes" | "single";
  /** Pesos das classes internacionais para aportes (somam 1). */
  classWeights: Record<IntlClass, number>;
  /** Distribuição do patrimônio inicial em US$ entre as classes (somam 1). */
  initialClassSplit: Record<IntlClass, number>;
}

/** Choque de mercado (stress test) aplicado sobre o cenário. */
export interface StressConfig {
  /** Queda máxima do preço (0,25 = -25%). */
  drop: number;
  /** Meses até o fundo. */
  dropMonths: number;
  /** Meses para voltar à trajetória do cenário; null = sem recuperação. */
  recoveryMonths: number | null;
  /** Buckets atingidos pela queda. */
  buckets: Bucket[];
  /** Pausar aportes durante queda + recuperação (contrafactual). */
  pauseContributions?: boolean;
}

export interface MonthRow {
  month: number; // 1..N
  fx: number;
  contributedBrl: number; // acumulado (inclui patrimônio inicial convertido)
  contributionsOnlyBrl: number; // somente aportes mensais acumulados
  brazilBrl: number;
  exteriorUsd: number; // estratégico
  legacyUsd: number;
  exteriorBrl: number; // (estratégico + legado) × fx
  incomeCashBrl: number; // proventos não reinvestidos acumulados
  totalBrl: number;
  totalUsd: number;
  realTotalBrl: number; // em poder de compra de hoje
  incomeBrl: number; // proventos do mês (R$)
  reinvestedBrl: number; // proventos reinvestidos no mês
  /** Índice de preço do choque (1 = sem choque) — só no stress test. */
  shockLevel: number;
}

export interface ScenarioResult {
  months: MonthRow[];
  finalTotalBrl: number;
  finalTotalUsd: number;
  finalRealBrl: number;
  initialCapitalBrl: number;
  contributionsBrl: number;
  /** Crescimento = patrimônio final − capital inicial − aportes. */
  growthBrl: number;
  incomeTotalBrl: number;
  reinvestedTotalBrl: number;
  notReinvestedTotalBrl: number;
  /** Proventos por ano (R$), índice 0 = ano 1. */
  incomeByYear: number[];
  /** Renda anual dos últimos 12 meses simulados. */
  lastYearIncomeBrl: number;
  yieldOnPatrimony: number;
  yieldOnCapital: number;
  /** Decomposição do exterior (retornos ponderados no tempo). */
  exteriorAssetReturn: number;
  fxReturn: number;
  exteriorTotalReturnBrl: number;
  /** Decomposição do ganho em R$: ativos x câmbio (soma = crescimento). */
  assetGainBrl: number;
  fxGainBrl: number;
  /** Exposição cambial no fim (fração do patrimônio no exterior). */
  finalExteriorShare: number;
}
