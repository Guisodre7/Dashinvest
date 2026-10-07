import { describe, expect, it } from "vitest";
import { computeStance, DEFAULT_TAX, type StanceInput } from "@/lib/analysis/stance";
import { purchaseVerdict, reviewConclusion, reviewEntry } from "@/lib/thesis/logic";

describe("diário de teses", () => {
  it("conclusão da revisão pelas premissas", () => {
    expect(reviewConclusion(["mantida", "mantida"])).toBe("Tese preservada");
    expect(reviewConclusion(["mantida", "enfraquecida", "mantida"])).toBe("Tese parcialmente comprometida");
    expect(reviewConclusion(["quebrada", "mantida", "mantida"])).toBe("Tese parcialmente comprometida");
    expect(reviewConclusion(["quebrada", "quebrada", "mantida"])).toBe("Tese significativamente comprometida");
    expect(reviewConclusion(["sem avaliação"])).toBe("Sem avaliação");
  });
});

describe("foi uma boa entrada? (decisão ≠ resultado)", () => {
  it("compra racional que caiu depois continua sendo boa decisão", () => {
    const r = reviewEntry({ date: "2026-01-10", price: 15.2 }, { band: "atrativo", quality: "boa", thesis: "intacta", fair: 17 }, { price: 12, band: "forte", thesis: "intacta" });
    expect(r.decision).toBe("Boa decisão");
    expect(r.lesson).toMatch(/compra era racional/);
  });
  it("compra esticada que subiu depois continua sendo arriscada", () => {
    const r = reviewEntry({ date: "2026-01-10", price: 100 }, { band: "extremo", quality: "excelente", thesis: "intacta", fair: 70 }, { price: 130, band: "extremo", thesis: "intacta" });
    expect(r.decision).toBe("Decisão arriscada");
    expect(r.lesson).toMatch(/não torna a entrada boa/);
  });
  it("sem registro da época: não julga pela variação do preço", () => {
    expect(reviewEntry({ date: "2025-01-01", price: 10 }, null, { price: 20, band: null, thesis: "intacta" }).decision).toBe("Sem registro da época");
  });
});

describe("analisar compra — veredito", () => {
  const base: StanceInput = {
    ticker: "NU", isEtf: false, isLegacy: false, price: 13, fair: { low: 14, mean: 16, high: 18, basis: "fair-value" },
    qualityScore: 80, qualityCoverage: 0.9, signalKinds: [], estimates: { direction: "rising", significantCut: false, epsRev90d: 4 },
    priceChange6m: 5, weight: 4, target: 8, maxWeight: 12, position: { quantity: 100, avgCost: 12, value: 1300 }, lastSell: null, tax: DEFAULT_TAX.US, currency: "US$",
  };
  const v = (over: Partial<StanceInput>, ctx: Partial<Parameters<typeof purchaseVerdict>[1]> = {}) =>
    purchaseVerdict(computeStance({ ...base, ...over }), { weightAfter: 6, target: 8, maxWeight: 12, dataStale: false, ...ctx });

  it("atrativa com tese ok e peso dentro do máximo → COMPRA ATRATIVA", () => expect(v({}).key).toBe("atrativa"));
  it("atrativa mas passaria do peso máximo → COMPRA PARCIAL", () => expect(v({}, { weightAfter: 14 }).key).toBe("parcial"));
  it("preço justo e abaixo da meta → COMPRA PARCIAL em partes", () => {
    const r = v({ price: 16 });
    expect(r.key).toBe("parcial");
    expect(r.plan.map((p) => p.pct)).toEqual([40, 30, 30]);
  });
  it("esticado → ESPERAR MELHOR PREÇO; deteriorada → NÃO AUMENTAR", () => {
    expect(v({ price: 18.5, qualityScore: 70 }).key).toBe("esperar");
    // Excelente e só um pouco cara: compra parcial (aporte menor), não espera para sempre.
    expect(v({ price: 18.5 }).key).toBe("parcial");
    expect(v({ signalKinds: ["THESIS_DETERIORATION"] }).key).toBe("nao_aumentar");
  });
  it("sem valuation → DADOS INSUFICIENTES", () => expect(v({ fair: null }).key).toBe("sem_dados"));
});

describe("alerta de mudança de tese", async () => {
  const { thesisCandidates } = await import("@/lib/notify/candidates");
  const thesis = { id: "t1", market: "US" as const, ticker: "NU", created_at: "2026-01-01", price: 15.2, quantity: 10, band: "atrativo" as const, quality: "boa" as const,
    text: "Expansão internacional", premises: ["Clientes crescendo", "México lucrativo", "Inadimplência controlada"], expectation: null, risks: [], changeMyMind: null, horizon: null, status: "ativa" as const, reviews: [] };
  const st = (signalKinds: string[]) => computeStance({ ticker: "NU", isEtf: false, isLegacy: false, price: 12, fair: { low: 13, mean: 15, high: 17, basis: "fair-value" }, qualityScore: 70, qualityCoverage: 1, signalKinds, estimates: { direction: "falling", significantCut: true, epsRev90d: -8 }, priceChange6m: -20, weight: 5, target: 8, maxWeight: 12, position: null, lastSell: null, tax: DEFAULT_TAX.US, currency: "US$" });
  it("tese ativa + deterioração → alerta crítico com link para a tese", () => {
    const c = thesisCandidates([thesis], [st(["THESIS_DETERIORATION"])]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ category: "thesis", priority: "critical", url: "/teses/t1", title: "Mudança potencial de tese: NU" });
    expect(c[0].body).toMatch(/Clientes crescendo; México lucrativo…/);
  });
  it("tese encerrada não alerta", () => {
    expect(thesisCandidates([{ ...thesis, status: "encerrada" }], [st(["THESIS_DETERIORATION"])])).toHaveLength(0);
  });
});

describe("números digitados", async () => {
  const { parseUserNumber } = await import("@/lib/userNumber");
  it("pt-BR, decimal com ponto e milhar", () => {
    expect(parseUserNumber("182.57")).toBe(182.57);
    expect(parseUserNumber("1.234,56")).toBe(1234.56);
    expect(parseUserNumber("1.234.567")).toBe(1234567);
    expect(parseUserNumber("R$ 500")).toBe(500);
    expect(parseUserNumber("")).toBeNull();
  });
  it("ativo fora da estratégia: sem comparação com meta 0%", () => {
    const st = computeStance({ ticker: "NU", isEtf: false, isLegacy: false, price: 13, fair: { low: 14, mean: 16, high: 18, basis: "fair-value" }, qualityScore: 80, qualityCoverage: 1, signalKinds: [], estimates: { direction: "rising", significantCut: false, epsRev90d: 4 }, priceChange6m: 0, weight: 0, target: 0, maxWeight: null, position: null, lastSell: null, tax: DEFAULT_TAX.US, currency: "US$" });
    const r = purchaseVerdict(st, { weightAfter: 3.8, target: 0, maxWeight: null, dataStale: false });
    expect(r.why.join(" ")).toMatch(/fora da estratégia/);
    expect(r.why.join(" ")).not.toMatch(/acima da meta/);
  });
});
