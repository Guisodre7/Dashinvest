import { describe, expect, it } from "vitest";
import {
  calculatePercentiles, compareAllocations, compareContributions, extraContribution, monthlyRate,
  sensitivity, simulateAll, simulateMonteCarlo, simulateScenario, stressTest,
} from "@/lib/projection/engine";
import { defaultForm, projectionFormSchema, toInput, toScenarioMap } from "@/lib/projection/settings";
import type { ProjectionInput, ScenarioAssumptions } from "@/lib/projection/types";

const zero = { ret: 0, yield: 0 };
function scen(over: Partial<ScenarioAssumptions> = {}): ScenarioAssumptions {
  return { brazil: zero, exterior: zero, growth: zero, jepq: zero, lqd: zero, vnq: zero, legacy: zero, inflation: 0, fxChange: 0, reinvest: true, ...over };
}
const allGrowth = { growth: 1, jepq: 0, lqd: 0, vnq: 0 };
function inp(over: Partial<ProjectionInput> = {}): ProjectionInput {
  return {
    initialBrl: 0, initialUsd: 0, initialLegacyUsd: 0, monthlyContributionBrl: 0, horizonMonths: 12,
    brazilShare: 1, usdBrl: 5, contributionTiming: "end", exteriorMode: "classes",
    classWeights: allGrowth, initialClassSplit: allGrowth, ...over,
  };
}

describe("juros compostos", () => {
  it("converte taxa anual em mensal equivalente", () => {
    expect(Math.pow(1 + monthlyRate(0.12), 12)).toBeCloseTo(1.12, 12);
    expect(monthlyRate(0.12)).not.toBeCloseTo(0.01, 4); // não é 12/12
  });
  it("R$1.000 a 12% a.a. por 12 meses = R$1.120,00", () => {
    const r = simulateScenario(inp({ initialBrl: 1000 }), scen({ brazil: { ret: 0.12, yield: 0 } }));
    expect(r.finalTotalBrl).toBe(1120);
    expect(r.growthBrl).toBe(120);
  });
});

describe("aportes", () => {
  it("sem retorno: 12 × R$100 = R$1.200", () => {
    const r = simulateScenario(inp({ monthlyContributionBrl: 100 }), scen());
    expect(r.finalTotalBrl).toBe(1200);
    expect(r.contributionsBrl).toBe(1200);
    expect(r.growthBrl).toBe(0);
  });
  it("valor futuro de anuidade (fim e início do mês) a 1% a.m.", () => {
    const annual = Math.pow(1.01, 12) - 1;
    const end = simulateScenario(inp({ monthlyContributionBrl: 100 }), scen({ brazil: { ret: annual, yield: 0 } }));
    expect(end.finalTotalBrl).toBeCloseTo(100 * ((Math.pow(1.01, 12) - 1) / 0.01), 2); // 1268,25
    const start = simulateScenario(inp({ monthlyContributionBrl: 100, contributionTiming: "start" }), scen({ brazil: { ret: annual, yield: 0 } }));
    expect(start.finalTotalBrl).toBeCloseTo(1268.25 * 1.01, 1); // 1280,93
  });
});

describe("dividendos e reinvestimento", () => {
  const a = (reinvest: boolean) => scen({ brazil: { ret: 0.12, yield: 0.06 }, reinvest });
  it("reinvestindo, o retorno total é exatamente a premissa (sem dupla contagem)", () => {
    const r = simulateScenario(inp({ initialBrl: 1000 }), a(true));
    expect(r.finalTotalBrl).toBe(1120);
    expect(r.incomeTotalBrl).toBeGreaterThan(55);
    expect(r.reinvestedTotalBrl).toBe(r.incomeTotalBrl);
    expect(r.notReinvestedTotalBrl).toBe(0);
  });
  it("sem reinvestir, proventos viram caixa e o patrimônio = investido + caixa", () => {
    const r = simulateScenario(inp({ initialBrl: 1000 }), a(false));
    const last = r.months[r.months.length - 1];
    expect(r.reinvestedTotalBrl).toBe(0);
    expect(last.incomeCashBrl).toBeCloseTo(r.incomeTotalBrl, 2);
    expect(r.finalTotalBrl).toBeCloseTo(last.brazilBrl + last.incomeCashBrl, 2);
    expect(r.finalTotalBrl).toBeLessThan(1120);
    expect(r.finalTotalBrl).toBeGreaterThan(1110);
  });
  it("renda anual e yields", () => {
    const r = simulateScenario(inp({ initialBrl: 10000, horizonMonths: 24 }), scen({ brazil: { ret: 0.1, yield: 0.05 } }));
    expect(r.incomeByYear.length).toBe(2);
    expect(r.yieldOnPatrimony).toBeCloseTo(0.05, 2);
    expect(r.yieldOnCapital).toBeGreaterThan(r.yieldOnPatrimony);
  });
});

describe("câmbio", () => {
  it("US$100 a R$5 com dólar +10% a.a. → R$550; ganho 100% cambial", () => {
    const r = simulateScenario(inp({ initialUsd: 100, brazilShare: 0 }), scen({ fxChange: 0.1 }));
    expect(r.finalTotalBrl).toBe(550);
    expect(r.finalTotalUsd).toBe(100);
    expect(r.fxGainBrl).toBe(50);
    expect(r.assetGainBrl).toBe(0);
    expect(r.fxReturn).toBeCloseTo(0.1, 10);
  });
  it("decomposição: (1 + ativos) × (1 + câmbio) − 1 = total BRL", () => {
    const r = simulateScenario(inp({ initialUsd: 1000, brazilShare: 0, monthlyContributionBrl: 500 }), scen({ growth: { ret: 0.08, yield: 0.01 }, fxChange: 0.03 }));
    expect(r.exteriorAssetReturn).toBeCloseTo(0.08, 6);
    expect((1 + r.exteriorAssetReturn) * (1 + r.fxReturn) - 1).toBeCloseTo(r.exteriorTotalReturnBrl, 10);
    expect(r.assetGainBrl + r.fxGainBrl).toBeCloseTo(r.growthBrl, 1);
  });
});

describe("Brasil / exterior", () => {
  it("divide o aporte e converte pelo câmbio", () => {
    const r = simulateScenario(inp({ monthlyContributionBrl: 1000, brazilShare: 0.4 }), scen());
    const last = r.months[11];
    expect(last.brazilBrl).toBe(4800);
    expect(last.exteriorUsd).toBe(1440); // 600/5 × 12
    expect(r.finalTotalBrl).toBe(12000);
  });
  it("respeita os pesos das classes e a posição legada não recebe aportes", () => {
    const w = { growth: 0.5, jepq: 0.2, lqd: 0.2, vnq: 0.1 };
    const r = simulateScenario(inp({ monthlyContributionBrl: 1000, brazilShare: 0, classWeights: w, initialClassSplit: w, initialLegacyUsd: 100 }),
      scen({ lqd: { ret: 0.05, yield: 0 } }));
    expect(r.months[11].legacyUsd).toBe(100);
    expect(r.finalTotalBrl).toBeGreaterThan(12500);
  });
  it("comparador de alocações", () => {
    const res = compareAllocations(inp({ monthlyContributionBrl: 1000, horizonMonths: 60 }), scen({ brazil: { ret: 0.1, yield: 0 }, growth: { ret: 0.05, yield: 0 } }), [1, 0.6, 0]);
    expect(res[0].final).toBeGreaterThan(res[2].final);
    expect(res[0].exteriorShareFinal).toBe(0);
    expect(res[2].exteriorShareFinal).toBeCloseTo(1, 6);
  });
});

describe("cenários e comparadores", () => {
  const form = defaultForm({ monthlyContributionBrl: 5000, horizonMonths: 60, initialBrl: 50000, initialUsd: 10000 });
  const input = toInput(form, null);
  const scenarios = toScenarioMap(form);

  it("defaults: pessimista < moderado < otimista", () => {
    const r = simulateAll(input, scenarios);
    expect(r.pessimista.finalTotalBrl).toBeLessThan(r.moderado.finalTotalBrl);
    expect(r.moderado.finalTotalBrl).toBeLessThan(r.otimista.finalTotalBrl);
    expect(r.moderado.months).toHaveLength(60);
  });
  it("comparador de aportes é crescente", () => {
    const c = compareContributions(input, scenarios, [2000, 5000, 10000]);
    expect(c[0].final.moderado).toBeLessThan(c[1].final.moderado);
    expect(c[1].final.moderado).toBeLessThan(c[2].final.moderado);
  });
  it("R$1.000 a mais: diferença maior que o valor aportado quando o retorno é positivo", () => {
    const e = extraContribution(input, scenarios);
    expect(e.map((x) => x.months)).toEqual([36, 60, 120, 180]);
    expect(e[3].delta.moderado).toBeGreaterThan(180_000);
  });
  it("sensibilidade: +R$1.000 de aporte aumenta o patrimônio", () => {
    const s = sensitivity(input, scenarios.moderado);
    expect(s.find((x) => x.key === "aporte")!.delta).toBeGreaterThan(60_000);
    expect(Math.abs(s.find((x) => x.key === "yield")!.delta)).toBeLessThan(1); // reinvestindo
  });
  it("validação: Brasil + exterior deve somar 100%", () => {
    expect(projectionFormSchema.safeParse({ ...form, brazilPct: 50, exteriorPct: 40 }).success).toBe(false);
    expect(projectionFormSchema.safeParse({ ...form, usdBrl: 0 }).success).toBe(false);
    expect(projectionFormSchema.safeParse({ ...form, monthlyContributionBrl: -1 }).success).toBe(false);
    expect(projectionFormSchema.safeParse(form).success).toBe(true);
  });
});

describe("stress test", () => {
  const i = inp({ initialUsd: 1000, brazilShare: 0 });
  it("queda de 20% em 1 mês e recuperação em 12 meses", () => {
    const r = stressTest({ ...i, horizonMonths: 24 }, scen(), { drop: 0.2, dropMonths: 1, recoveryMonths: 12, buckets: ["growth"] });
    expect(r.stressed.months[0].totalBrl).toBe(4000); // 800 × 5
    expect(r.maxDrawdown).toBeCloseTo(-0.2, 6);
    expect(r.patrimonyAtBottom).toBe(4000);
    expect(r.finalPatrimony).toBe(5000);
    expect(r.monthsToRecover).toBe(13);
  });
  it("sem recuperação o patrimônio não volta", () => {
    const r = stressTest({ ...i, horizonMonths: 24 }, scen(), { drop: 0.3, dropMonths: 3, recoveryMonths: null, buckets: ["growth"] });
    expect(r.finalPatrimony).toBeCloseTo(3500, 2);
    expect(r.monthsToRecover).toBeNull();
  });
  it("aportes durante a queda compram mais barato", () => {
    const r = stressTest({ ...i, monthlyContributionBrl: 5000, horizonMonths: 36 }, scen(), { drop: 0.25, dropMonths: 6, recoveryMonths: 12, buckets: ["growth"] });
    expect(r.avgPriceLevelOfShockContributions!).toBeLessThan(1);
    expect(r.keepContributingGain).toBeGreaterThan(0);
    expect(r.contributedDuringDrop).toBe(30000);
  });
});

describe("Monte Carlo (arquitetura)", () => {
  it("percentis por interpolação", () => {
    const p = calculatePercentiles([5, 1, 4, 2, 3]);
    expect(p[50]).toBe(3);
    expect(p[25]).toBe(2);
    expect(p[10]).toBeCloseTo(1.4, 10);
  });
  it("simulações reprodutíveis e centradas na premissa", () => {
    const vol = { brazil: 0, growth: 0.2, jepq: 0, lqd: 0, vnq: 0, legacy: 0 };
    const a = scen({ growth: { ret: 0.08, yield: 0 } });
    const input = inp({ initialUsd: 1000, brazilShare: 0, horizonMonths: 12 });
    const r1 = simulateMonteCarlo(input, a, { runs: 400, volatility: vol, seed: 7 });
    const r2 = simulateMonteCarlo(input, a, { runs: 400, volatility: vol, seed: 7 });
    expect(r1).toEqual(r2);
    const mean = r1.reduce((s, x) => s + x, 0) / r1.length;
    expect(mean / 5400).toBeGreaterThan(0.96);
    expect(mean / 5400).toBeLessThan(1.04);
    const p = calculatePercentiles(r1);
    expect(p[10]).toBeLessThan(p[50]);
    expect(p[50]).toBeLessThan(p[90]);
  });
});

import { parseNum } from "@/components/projection/fields";
describe("entrada numérica pt-BR", () => {
  it("interpreta milhar e decimal", () => {
    expect(parseNum("7.000")).toBe(7000);
    expect(parseNum("1.250.000")).toBe(1250000);
    expect(parseNum("5.000,50")).toBe(5000.5);
    expect(parseNum("5,4321")).toBe(5.4321);
    expect(parseNum("5.5")).toBe(5.5);
    expect(parseNum("R$ 2.000")).toBe(2000);
    expect(parseNum("abc")).toBeNull();
  });
});

describe("stress test com aportes grandes", () => {
  it("isola o choque comparando com o cenário sem queda", () => {
    const i = inp({ initialUsd: 1000, brazilShare: 0, monthlyContributionBrl: 50000, horizonMonths: 24 });
    const r = stressTest(i, scen(), { drop: 0.25, dropMonths: 6, recoveryMonths: 12, buckets: ["growth"] });
    expect(r.maxDrawdown).toBe(0);
    expect(r.bottomMonth).toBe(6);
    expect(r.vsBaseAtMarketBottom).toBeLessThan(-0.05);
  });
});
