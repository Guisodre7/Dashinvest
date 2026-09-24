import { z } from "zod";
import { INTL_CLASSES, SCENARIO_KEYS, type IntlClass, type ProjectionInput, type ScenarioAssumptions, type ScenarioKey, type StressConfig } from "./types";

/**
 * Formulário do simulador em unidades digitadas pelo usuário (percentuais
 * em % — 8 = 8% a.a.). Validado no servidor com zod; os DEFAULTS abaixo são
 * apenas premissas editáveis, nunca expectativas de mercado.
 */

const rate = (min: number, max: number) => z.number().finite().min(min).max(max);
const money = z.number().finite().min(0).max(1e10);

export const scenarioFormSchema = z.object({
  brazilRet: rate(-50, 50), brazilYield: rate(0, 30),
  exteriorRet: rate(-50, 50), exteriorYield: rate(0, 30),
  growthRet: rate(-50, 50), growthYield: rate(0, 30),
  jepqRet: rate(-50, 50), jepqYield: rate(0, 30),
  lqdRet: rate(-50, 50), lqdYield: rate(0, 30),
  vnqRet: rate(-50, 50), vnqYield: rate(0, 30),
  legacyRet: rate(-50, 50), legacyYield: rate(0, 30),
  inflation: rate(-10, 100),
  fxChange: rate(-50, 50),
  reinvest: z.boolean(),
});
export type ScenarioForm = z.infer<typeof scenarioFormSchema>;

export const projectionFormSchema = z.object({
  initialBrl: money,
  initialUsd: money,
  initialLegacyUsd: money,
  monthlyContributionBrl: money,
  horizonMonths: z.number().int().min(1).max(600),
  brazilPct: rate(0, 100),
  exteriorPct: rate(0, 100),
  usdBrl: z.number().finite().gt(0).max(100),
  contributionTiming: z.enum(["start", "end"]),
  exteriorMode: z.enum(["classes", "single"]),
  useCurrentAllocation: z.boolean(),
  classWeightsPct: z.object({ growth: rate(0, 100), jepq: rate(0, 100), lqd: rate(0, 100), vnq: rate(0, 100) }),
  scenarios: z.object({ pessimista: scenarioFormSchema, moderado: scenarioFormSchema, otimista: scenarioFormSchema }),
  stress: z.object({
    dropPct: rate(1, 90),
    dropMonths: z.number().int().min(1).max(60),
    recoveryMonths: z.number().int().min(0).max(240), // 0 = sem recuperação
    includeBrazil: z.boolean(),
    scenario: z.enum(["pessimista", "moderado", "otimista"]),
  }),
}).superRefine((v, ctx) => {
  if (Math.abs(v.brazilPct + v.exteriorPct - 100) > 0.001) {
    ctx.addIssue({ code: "custom", path: ["brazilPct"], message: "Brasil + Exterior deve somar 100%." });
  }
  const cw = INTL_CLASSES.reduce((s, c) => s + v.classWeightsPct[c], 0);
  if (Math.abs(cw - 100) > 0.01) {
    ctx.addIssue({ code: "custom", path: ["classWeightsPct"], message: `Pesos das classes internacionais somam ${cw.toFixed(2)}% — devem somar 100%.` });
  }
});
export type ProjectionForm = z.infer<typeof projectionFormSchema>;

export const DEFAULT_SCENARIOS: Record<ScenarioKey, ScenarioForm> = {
  pessimista: {
    brazilRet: 8, brazilYield: 2.5, exteriorRet: 3, exteriorYield: 2.5,
    growthRet: 2, growthYield: 0.5, jepqRet: 4, jepqYield: 7, lqdRet: 4, lqdYield: 4, vnqRet: 3, vnqYield: 3.5,
    legacyRet: 3, legacyYield: 1.2, inflation: 5.5, fxChange: 0, reinvest: true,
  },
  moderado: {
    brazilRet: 12, brazilYield: 3.5, exteriorRet: 8, exteriorYield: 3.5,
    growthRet: 10, growthYield: 0.6, jepqRet: 7, jepqYield: 9, lqdRet: 5, lqdYield: 4.5, vnqRet: 7, vnqYield: 3.8,
    legacyRet: 8, legacyYield: 1.3, inflation: 4.5, fxChange: 2, reinvest: true,
  },
  otimista: {
    brazilRet: 15, brazilYield: 5, exteriorRet: 12, exteriorYield: 5,
    growthRet: 15, growthYield: 0.7, jepqRet: 10, jepqYield: 11, lqdRet: 6.5, lqdYield: 5, vnqRet: 11, vnqYield: 4.2,
    legacyRet: 12, legacyYield: 1.4, inflation: 3.5, fxChange: 4, reinvest: true,
  },
};

export const DEFAULT_CLASS_WEIGHTS: Record<IntlClass, number> = { growth: 50, jepq: 20, lqd: 20, vnq: 10 };

export function defaultForm(prefill: Partial<ProjectionForm> = {}): ProjectionForm {
  return {
    initialBrl: 0,
    initialUsd: 0,
    initialLegacyUsd: 0,
    monthlyContributionBrl: 5000,
    horizonMonths: 36,
    brazilPct: 40,
    exteriorPct: 60,
    usdBrl: 5.5,
    contributionTiming: "end",
    exteriorMode: "classes",
    useCurrentAllocation: true,
    classWeightsPct: { ...DEFAULT_CLASS_WEIGHTS },
    scenarios: structuredClone(DEFAULT_SCENARIOS),
    stress: { dropPct: 25, dropMonths: 6, recoveryMonths: 24, includeBrazil: false, scenario: "moderado" },
    ...prefill,
  };
}

const f = (pct: number) => pct / 100;

export function toAssumptions(s: ScenarioForm): ScenarioAssumptions {
  return {
    brazil: { ret: f(s.brazilRet), yield: f(s.brazilYield) },
    exterior: { ret: f(s.exteriorRet), yield: f(s.exteriorYield) },
    growth: { ret: f(s.growthRet), yield: f(s.growthYield) },
    jepq: { ret: f(s.jepqRet), yield: f(s.jepqYield) },
    lqd: { ret: f(s.lqdRet), yield: f(s.lqdYield) },
    vnq: { ret: f(s.vnqRet), yield: f(s.vnqYield) },
    legacy: { ret: f(s.legacyRet), yield: f(s.legacyYield) },
    inflation: f(s.inflation),
    fxChange: f(s.fxChange),
    reinvest: s.reinvest,
  };
}

export function toScenarioMap(form: ProjectionForm): Record<ScenarioKey, ScenarioAssumptions> {
  return Object.fromEntries(SCENARIO_KEYS.map((k) => [k, toAssumptions(form.scenarios[k])])) as Record<ScenarioKey, ScenarioAssumptions>;
}

/** Converte o formulário validado em entrada do motor. */
export function toInput(form: ProjectionForm, currentSplit: Record<IntlClass, number> | null): ProjectionInput {
  const weights = Object.fromEntries(INTL_CLASSES.map((c) => [c, form.classWeightsPct[c] / 100])) as Record<IntlClass, number>;
  return {
    initialBrl: form.initialBrl,
    initialUsd: form.initialUsd,
    initialLegacyUsd: form.initialLegacyUsd,
    monthlyContributionBrl: form.monthlyContributionBrl,
    horizonMonths: form.horizonMonths,
    brazilShare: form.brazilPct / 100,
    usdBrl: form.usdBrl,
    contributionTiming: form.contributionTiming,
    exteriorMode: form.exteriorMode,
    classWeights: weights,
    initialClassSplit: form.useCurrentAllocation && currentSplit ? currentSplit : weights,
  };
}

export function toStress(form: ProjectionForm): StressConfig {
  return {
    drop: form.stress.dropPct / 100,
    dropMonths: form.stress.dropMonths,
    recoveryMonths: form.stress.recoveryMonths === 0 ? null : form.stress.recoveryMonths,
    buckets: form.stress.includeBrazil ? ["brazil", "growth", "jepq", "vnq", "legacy"] : ["growth", "jepq", "vnq", "legacy"],
  };
}

/** Classe do modelo para cada ticker da carteira real. */
export function classOfTicker(ticker: string): IntlClass {
  if (ticker === "JEPQ") return "jepq";
  if (ticker === "LQD") return "lqd";
  if (ticker === "VNQ") return "vnq";
  return "growth";
}
