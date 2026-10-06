import { describe, expect, it } from "vitest";
import { allocateBr } from "@/lib/allocation/brAllocate";
import { splitMonthly } from "@/lib/allocation/split";
import { computeStance, DEFAULT_TAX, type StanceInput } from "@/lib/analysis/stance";
import type { BrStrategy } from "@/lib/portfolio/brStrategy";
import type { PortfolioLedgerSummary } from "@/lib/portfolio/ledger";

const strategy: BrStrategy = {
  classes: { renda_fixa: 50, acao: 25, fii: 25 },
  assets: [
    { code: "ITUB4", asset_class: "acao", name: null, enabled: true }, { code: "PETR4", asset_class: "acao", name: null, enabled: true },
    { code: "HGLG11", asset_class: "fii", name: null, enabled: true }, { code: "KNRI11", asset_class: "fii", name: null, enabled: true },
  ],
};
const summary = (rf: number, ac: number, fii: number) => ({
  currentValue: rf + ac + fii,
  classes: [{ asset_class: "renda_fixa", value: rf }, { asset_class: "acao", value: ac }, { asset_class: "fii", value: fii }],
  holdings: [],
}) as unknown as PortfolioLedgerSummary;
const st = (code: string, assetClass: "acao" | "fii", price: number) => {
  const input: StanceInput = { ticker: code, isEtf: false, isLegacy: false, price, fair: { low: 90, mean: 100, high: 110, basis: "graham-bazin" }, qualityScore: 80, qualityCoverage: 1, signalKinds: [], estimates: { direction: "unknown", significantCut: false, epsRev90d: null }, priceChange6m: null, weight: 0, target: 12.5, maxWeight: 18, position: null, lastSell: null, tax: DEFAULT_TAX.BR_ACAO, currency: "R$" };
  return { code, assetClass, stance: computeStance(input), name: null };
};

describe("aporte da carteira Brasil", () => {
  it("renda fixa 72% (meta 50%): o aporte vai para ações e FIIs, não para renda fixa", () => {
    const r = allocateBr(3000, summary(7200, 1800, 1000), strategy, [st("ITUB4", "acao", 85), st("PETR4", "acao", 100), st("HGLG11", "fii", 85), st("KNRI11", "fii", 100)]);
    expect(r.lines.find((l) => l.assetClass === "renda_fixa")).toBeUndefined();
    expect(r.lines.reduce((a, l) => a + l.amount, 0)).toBe(3000);
    const itub = r.lines.find((l) => l.code === "ITUB4")!.amount, petr = r.lines.find((l) => l.code === "PETR4")!.amount;
    expect(itub).toBeGreaterThan(petr); // atrativo recebe mais que preço justo
  });

  it("ativo esticado não recebe; classe sem candidatos vira caixa de oportunidade", () => {
    const r = allocateBr(2000, summary(0, 0, 0), strategy, [st("ITUB4", "acao", 140), st("PETR4", "acao", 140), st("HGLG11", "fii", 95), st("KNRI11", "fii", 95)]);
    expect(r.lines.some((l) => l.code === "ITUB4" || l.code === "PETR4")).toBe(false);
    expect(r.lines.find((l) => l.assetClass === "caixa")?.amount).toBe(500);
    expect(r.notes.join(" ")).toMatch(/ITUB4, PETR4/);
    expect(r.lines.find((l) => l.assetClass === "renda_fixa")?.amount).toBe(1000);
  });
});

describe("aporte Brasil por prioridade", () => {
  it("só prioridade média ou alta recebe; alta recebe o dobro; sem dados espera", () => {
    const r = allocateBr(2000, summary(10000, 0, 0), strategy, [st("ITUB4", "acao", 85), st("PETR4", "acao", 100), st("HGLG11", "fii", 140)]);
    const itub = r.lines.find((l) => l.code === "ITUB4")!, petr = r.lines.find((l) => l.code === "PETR4")!;
    expect(itub.stance).toBe("comprar");
    expect(itub.amount).toBeGreaterThan(petr.amount * 1.5);
    expect(r.lines.some((l) => l.code === "HGLG11" || l.code === "KNRI11")).toBe(false); // esticado e sem dados
    expect(r.lines.find((l) => l.assetClass === "caixa")).toBeDefined();
  });
});

describe("divisão mensal Brasil × Exterior", () => {
  const base = { totalBrl: 5000, brValue: 50000, usValueBrl: 50000, targetBrPct: 50, fxRate: 5, fxChange1m: 0, brOpportunities: 0, usOpportunities: 0 };
  it("na meta e sem contexto especial: metade para cada lado", () => {
    const r = splitMonthly(base);
    expect(r).toMatchObject({ brBrl: 2500, usBrl: 2500, usUsd: 500 });
  });
  it("Brasil abaixo da meta: o aporte corrige o desvio primeiro", () => {
    expect(splitMonthly({ ...base, brValue: 30000, usValueBrl: 70000 }).brBrl).toBe(5000);
  });
  it("dólar subiu 6% no mês: 10% a menos para o exterior, com explicação", () => {
    const r = splitMonthly({ ...base, fxChange1m: 6 });
    expect(r.brBrl).toBe(3000);
    expect(r.reasons.join(" ")).toMatch(/não é previsão/);
  });
  it("mais oportunidades no exterior puxam até 10%", () => {
    expect(splitMonthly({ ...base, usOpportunities: 3 }).usBrl).toBe(3000);
  });
});
