import { describe, expect, it } from "vitest";
import { analystSignal } from "@/lib/analysis/analystSignal";
import { brFair, brQuality, fiiKind } from "@/lib/analysis/brValuation";
import { dcfPerShare, discountRate, impliedGrowth } from "@/lib/analysis/dcf";
import { marketMood } from "@/lib/analysis/macro";
import { computeStance, DEFAULT_TAX, type StanceInput } from "@/lib/analysis/stance";
import type { BrFundamentals } from "@/lib/market/parseFundamentus";
import type { MacroIndicator } from "@/lib/market/types";

describe("fluxo de caixa descontado", () => {
  it("juro mais alto = valor menor; DCF reverso recupera o crescimento usado", () => {
    const low = dcfPerShare(5, 0.08, discountRate(3, 1)), high = dcfPerShare(5, 0.08, discountRate(5, 1));
    expect(high).toBeLessThan(low);
    const r = discountRate(4.2, 1.1);
    expect(impliedGrowth(dcfPerShare(5, 0.1, r), 5, r)!).toBeCloseTo(0.1, 3);
  });
});

describe("Brasil: juros do Banco Central no valuation", () => {
  const acao = { kind: "acao", price: 30, lpa: 4, vpa: 20, dy: 8 } as BrFundamentals;
  it("juro real alto exige mais dividendo e P/L menor → valor justo menor", () => {
    const sem = brFair(acao, 30), alto = brFair(acao, 30, 9.5), baixo = brFair(acao, 30, 4);
    expect(alto.methods).toHaveLength(3);
    expect(alto.fair!.mean).toBeLessThan(baixo.fair!.mean);
    expect(sem.methods.map((m) => m.label)).toEqual(["Graham", "Bazin (6%)"]);
  });
  it("P/VP justificado pelo ROE reconhece empresa que cresce com retorno alto", () => {
    const banco = { kind: "acao", price: 40, lpa: 4, vpa: 18, dy: 3, pl: 10, roe: 23 } as BrFundamentals;
    const v = brFair(banco, 40, 9.5, 5);
    expect(v.methods.map((m) => m.label)).toContain("P/VP justificado pelo ROE");
    const pvp = v.methods.find((m) => m.label === "P/VP justificado pelo ROE")!.value / 18;
    expect(pvp).toBeGreaterThan(1.5); // ROE 23% vale bem mais que o patrimônio
  });

  it("modelos setoriais (spec §9 e §11): banco sem dívida/ROIC; FII de papel sem modelo de tijolo", () => {
    const banco = { kind: "acao", sector: "Intermediários Financeiros", roe: 22, roic: 3, grossDebtToEquity: 8, revenueGrowth5y: 15, netMargin: 30 } as BrFundamentals;
    const q = brQuality(banco);
    expect(q.score).toBe(100); // ROE e crescimento bons; dívida/patrimônio e ROIC ignorados
    expect(q.notes.join(" ")).toMatch(/CET1/);
    const papel = { kind: "fii", segment: "Títulos e Val. Mob.", vacancy: 40, properties: 0 } as BrFundamentals;
    expect(brQuality(papel)).toMatchObject({ score: null, coverage: 0 });
    expect(fiiKind(papel)).toBe("papel");
    expect(fiiKind({ segment: "Logística" })).toBe("tijolo");
  });

  it("FII: VP/cota + renda pelo juro real", () => {
    const fii = { kind: "fii", price: 100, vpa: 110, dy: 11, dividendPerShare12m: 11 } as BrFundamentals;
    const v = brFair(fii, 100, 9);
    expect(v.methods).toHaveLength(2);
    expect(v.fair!.mean).toBeCloseTo((110 + 11 / 0.085) / 2, 1); // juro real longo = (9 + 5) / 2 = 7%
  });
});

describe("confirmações antes de chamar de oportunidade", () => {
  const base: StanceInput = {
    ticker: "X", isEtf: false, isLegacy: false, price: 80, fair: { low: 90, mean: 100, high: 110, basis: "fair-value" },
    qualityScore: 82, qualityCoverage: 0.9, signalKinds: [], estimates: { direction: "stable", significantCut: false, epsRev90d: 0 },
    priceChange6m: 0, weight: 5, target: 10, maxWeight: 15, position: null, lastSell: null, tax: DEFAULT_TAX.US, currency: "US$",
  };
  it("barata com analistas cortando → esperar; preço embutindo crescimento demais → aporte normal", () => {
    expect(computeStance(base).action).toBe("comprar");
    expect(computeStance({ ...base, analystScore: -0.6 }).action).toBe("nao_aumentar");
    expect(computeStance({ ...base, impliedGap: 0.12 }).action).toBe("manter");
  });
  it("incerteza alta exige mais desconto", () => {
    expect(computeStance({ ...base, price: 84 }).band).toBe("forte");
    expect(computeStance({ ...base, price: 84, uncertain: true }).band).toBe("atrativo"); // forte só abaixo de 0,80
    expect(computeStance({ ...base, price: 93 }).band).toBe("atrativo");
    expect(computeStance({ ...base, price: 93, uncertain: true }).band).toBe("justo");
  });
  it("sinal dos analistas: revisão de lucro + mudança de recomendação", () => {
    const rec = (sb: number, b: number, h: number) => ({ period: "", strong_buy: sb, buy: b, hold: h, sell: 0, strong_sell: 0 });
    const s = analystSignal({ eps_rev_90d: 5, eps_rev_30d: null } as never, { recommendations: [rec(20, 10, 2), rec(15, 10, 5), rec(12, 10, 8), rec(10, 10, 10)], target_high: 300, target_low: 150, target_mean: 220 } as never);
    expect(s.score!).toBeGreaterThan(0.6);
    expect(s.dispersion!).toBeCloseTo(150 / 220);
  });
});

describe("humor do mercado (ritmo do aporte)", () => {
  const m = (key: MacroIndicator["key"], value: number, ref: number | null = null) => ({ key, value, ref }) as MacroIndicator;
  it("medo, euforia e normal", () => {
    expect(marketMood([m("VIX", 28), m("HYSPREAD", 5.4)], null).mood).toBe("medo");
    expect(marketMood([m("VIX", 13), m("HYSPREAD", 2.8)], null).mood).toBe("euforia");
    expect(marketMood([m("VIX", 18), m("HYSPREAD", 3.6), m("EPU", 120, 110)], null).mood).toBe("normal");
    expect(marketMood([m("VIX", 26), m("EPU", 300, 150)], null).reasons).toContain("incerteza política alta");
  });
});
