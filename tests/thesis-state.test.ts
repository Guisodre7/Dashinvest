import { describe, expect, it } from "vitest";
import { computeStance, DEFAULT_TAX, type StanceInput } from "@/lib/analysis/stance";
import { brFair, isBrCommodity } from "@/lib/analysis/brValuation";
import type { BrFundamentals } from "@/lib/market/parseFundamentus";
import { applyThesisState, effectiveThesisState, type Thesis } from "@/lib/thesis/logic";
import { BASE_THESES } from "@/lib/thesis/baseTheses";

const base: StanceInput = {
  ticker: "X", isEtf: false, isLegacy: false, price: 80, fair: { low: 90, mean: 100, high: 110, basis: "fair-value" },
  qualityScore: 82, qualityCoverage: 0.9, signalKinds: [], estimates: { direction: "stable", significantCut: false, epsRev90d: 0 },
  priceChange6m: 0, weight: 5, target: 10, maxWeight: 15, position: null, lastSell: null, tax: DEFAULT_TAX.US, currency: "US$",
};
const t = (over: Partial<Thesis> = {}) => ({ state: undefined, stateLog: [], reviews: [], ...over }) as Pick<Thesis, "state" | "stateLog" | "reviews">;

describe("estados da tese (teses-base §6)", () => {
  it("dados podem levar no máximo a 'ameaçada' — invalidar é decisão do usuário", () => {
    const e = effectiveThesisState(t(), { thesis: "deteriorada", headline: "Sinais de deterioração" });
    expect(e).toMatchObject({ state: "ameaçada", by: "dados" });
    expect(e.reason).toMatch(/deterioração/);
    expect(effectiveThesisState(t(), { thesis: "intacta", headline: "" }).state).toBe("intacta");
  });
  it("decisão explícita do usuário prevalece e carrega o evento", () => {
    const u = t({ state: "invalidada", stateLog: [{ date: "2026-10-01", state: "invalidada", reason: "ROE abaixo de 12% por 4 trimestres", by: "usuário" }] });
    expect(effectiveThesisState(u, { thesis: "intacta", headline: "" })).toMatchObject({ state: "invalidada", by: "usuário", reason: "ROE abaixo de 12% por 4 trimestres" });
  });
  it("tese positiva NÃO vira compra; ameaçada segura compras; invalidada → avaliar saída", () => {
    const buy = computeStance(base);
    expect(buy.action).toBe("comprar");
    const caro = computeStance({ ...base, price: 115 });
    expect(applyThesisState(caro, { state: "intacta", reason: "", by: "usuário" }, false).action).toBe(caro.action); // intacta não muda a conta
    expect(applyThesisState(buy, { state: "ameaçada", reason: "inadimplência subindo", by: "usuário" }, true).action).toBe("nao_aumentar");
    expect(applyThesisState(buy, { state: "invalidada", reason: "x", by: "usuário" }, true).action).toBe("sair");
    expect(applyThesisState(buy, { state: "invalidada", reason: "x", by: "usuário" }, false).action).toBe("evitar");
  });
});

describe("teses-base e modelos setoriais", () => {
  it("21 teses-base com papel, confirmação, invalidação e o que monitorar", () => {
    expect(BASE_THESES).toHaveLength(21);
    for (const b of BASE_THESES) {
      expect(b.role.length).toBeGreaterThan(10);
      expect(b.confirms.length).toBeGreaterThan(0);
      expect(b.invalidates.length).toBeGreaterThan(0);
      expect(b.monitor.length).toBeGreaterThan(0);
    }
  });
  it("commodity (PETR4/VALE3): sem Bazin — dividendo passado não sustenta valor", () => {
    const petr = { kind: "acao", sector: "Petróleo, Gás e Biocombustíveis", price: 35, lpa: 6, vpa: 30, dy: 14, pl: 6, roe: 20 } as BrFundamentals;
    expect(isBrCommodity(petr)).toBe(true);
    expect(brFair(petr, 35, 9, 5).methods.some((m) => m.label.startsWith("Bazin"))).toBe(false);
  });
});
