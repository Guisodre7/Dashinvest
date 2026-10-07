import { describe, expect, it } from "vitest";
import { computeStance, DEFAULT_TAX, type StanceInput } from "@/lib/analysis/stance";

const base: StanceInput = {
  ticker: "XYZ", isEtf: false, isLegacy: false, price: 100,
  fair: { low: 70, mean: 80, high: 90, basis: "fair-value" },
  qualityScore: 82, qualityCoverage: 0.9, signalKinds: [],
  estimates: { direction: "stable", significantCut: false, epsRev90d: 0.5 },
  priceChange6m: 10, weight: 30, target: 10, maxWeight: 15,
  position: { quantity: 100, avgCost: 60, value: 10000 }, lastSell: null,
  tax: DEFAULT_TAX.US, currency: "US$",
};
const s = (over: Partial<StanceInput>) => computeStance({ ...base, ...over });

describe("valuation, realização parcial e recompra", () => {
  it("excelente + extremamente esticada (+30% do valor justo) → realização parcial em faixa, nunca 100%", () => {
    const r = s({ price: 104 }); // +30% sobre o valor justo médio
    expect(r.band).toBe("extremo");
    expect(r.action).toBe("realizacao");
    expect(r.realization!.pctLow).toBe(10);
    expect(r.realization!.pctHigh).toBe(20);
    expect(r.realization!.sharesHigh).toBe(20);
    expect(r.realization!.estTax).toBeCloseTo(20 * 44 * 0.15);
    expect(r.realization!.note).toMatch(/não ordem/);
  });

  it("mesma empresa um pouco esticada mas com só 3% da carteira → apenas não aumentar", () => {
    const r = s({ price: 90, weight: 3, target: 10, qualityScore: 70 });
    expect(r.band).toBe("esticado");
    expect(r.action).toBe("nao_aumentar");
    expect(r.realization).toBeNull();
  });

  it("venda é decidida pelo preço, não pelo peso: esticada demais com peso abaixo da meta ainda realiza", () => {
    const r = s({ price: 104, weight: 5, target: 10 });
    expect(r.action).toBe("realizacao");
    expect(r.headline).toMatch(/acima do valor justo/);
  });

  it("nunca vende só para reequilibrar: 30% da carteira (meta 10%) com preço justo ou um pouco esticado", () => {
    expect(s({ price: 80 }).action).toBe("manter");
    expect(s({ price: 90, qualityScore: 70 }).action).toBe("nao_aumentar");
    expect(s({ price: 90 }).realization).toBeNull();
  });

  it("excelente e só um pouco cara: aporte menor (não perde o compositor), nunca com tese em observação", () => {
    const r = s({ price: 90 });
    expect(r).toMatchObject({ band: "esticado", action: "manter", qualityPremium: true });
    expect(s({ price: 90, estimates: { direction: "falling", significantCut: false, epsRev90d: -2 } }).action).toBe("nao_aumentar");
    expect(s({ price: 104 }).action).toBe("realizacao"); // muito cara continua sendo realização
  });

  it("variação de preço ≠ valuation: subiu 50% e continua abaixo do valor justo → não é esticada", () => {
    const r = s({ price: 72, priceChange6m: 50, weight: 8 });
    expect(r.band).toBe("atrativo");
    expect(r.action).toBe("comprar");
  });

  it("alta justificada pelos fundamentos não gera realização mesmo acima do peso", () => {
    const r = s({ price: 90, qualityScore: 70, priceChange6m: 30, estimates: { direction: "rising", significantCut: false, epsRev90d: 8 } });
    expect(r.rally).toBe("justificada");
    expect(r.action).toBe("nao_aumentar");
    expect(r.realization).toBeNull();
  });

  it("alta só por expectativa é sinalizada", () => {
    expect(s({ price: 90, priceChange6m: 40 }).rally).toBe("expectativa");
    expect(s({ price: 90, priceChange6m: 40 }).reasons.join(" ")).toMatch(/mais rápido que os fundamentos/);
  });

  it("empresa ruim + barata → evitar; tese deteriorada + barata → não confundir preço baixo com oportunidade", () => {
    expect(s({ price: 60, qualityScore: 30 }).action).toBe("evitar");
    const d = s({ price: 60, signalKinds: ["THESIS_DETERIORATION"] });
    expect(d.action).toBe("evitar");
    expect(d.headline).toMatch(/não confundir preço baixo com oportunidade/);
  });

  it("recompra: vendeu a 100, caiu para 66 com fundamentos preservados → recompra em escada", () => {
    const r = s({ price: 66, weight: 8, lastSell: { date: "2026-03-01", price: 100, quantity: 20 } });
    expect(r.action).toBe("recompra");
    expect(r.rebuy!.dropFromSellPct).toBeCloseTo(-34);
    expect(r.rebuy!.ladder.map((l) => l.pctOfSold)).toEqual([40, 35, 25, 0, 0]);
    expect(r.rebuy!.impact.qty).toBe(8); // 40% de 20
  });

  it("recompra não é sugerida com tese deteriorada", () => {
    expect(s({ price: 66, weight: 8, lastSell: { date: "2026-03-01", price: 100, quantity: 20 }, signalKinds: ["THESIS_CHANGE"] }).action).toBe("evitar");
  });

  it("venda pequena demais para os custos → manter sem aumentar", () => {
    const r = s({ price: 104, position: { quantity: 1, avgCost: 60, value: 104 } });
    expect(r.action).toBe("nao_aumentar");
    expect(r.reasons.join(" ")).toMatch(/pequena demais|custos/);
  });

  it("isenção mensal BR: venda abaixo de R$ 20 mil sem imposto estimado", () => {
    const r = s({ price: 104, tax: DEFAULT_TAX.BR_ACAO, currency: "R$" });
    expect(r.realization!.estTax).toBe(0);
  });

  it("posição legada (VOO) e falta de dados", () => {
    expect(s({ isLegacy: true }).action).toBe("legado");
    expect(s({ fair: null }).action).toBe("aguardar");
  });
});
