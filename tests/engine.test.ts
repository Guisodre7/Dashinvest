import { describe, expect, it } from "vitest";
import { allocate } from "@/lib/analysis/allocation";
import { analyzeAsset, type AssetInput } from "@/lib/analysis/analyze";
import { estimateTrend } from "@/lib/analysis/estimates";
import { fairValueView } from "@/lib/analysis/valuation";
import { DEFAULT_ENGINE_SETTINGS } from "@/lib/analysis/settings";
import type { EarningsEstimates } from "@/lib/market/types";
import { bars, meta, quote, strategy } from "./helpers";

function est(rev30: number | null, rev90: number | null): EarningsEstimates {
  return {
    ticker: "X",
    periods: [{ period: "+1y", period_end: null, eps_avg: 10, eps_low: null, eps_high: null, revenue_avg: null, revenue_low: null, revenue_high: null, analyst_count: 30, eps_revision_30d_pct: rev30, eps_revision_90d_pct: rev90 }],
    surprises: [],
    meta: meta(),
  };
}

function input(ticker: string, closes: number[], extra: Partial<AssetInput> = {}): AssetInput {
  return {
    ticker, name: ticker, isEtf: false, strategy: strategy(ticker, 50), quote: quote(ticker, closes[closes.length - 1]),
    history: { ticker, bars: bars(closes), adjusted: true, meta: meta() }, fundamentals: null, estimates: null,
    estimateHistory: [], analysts: null, news: [], events: [], currentWeight: 50, targetWeight: 50, ...extra,
  };
}

const flatThenDrop = [...Array.from({ length: 230 }, () => 100), ...Array.from({ length: 30 }, (_, i) => 100 - i * 0.6)];

describe("detectores", () => {
  it("🟢 compressão de valuation: preço cai e estimativas sobem", () => {
    const a = analyzeAsset(input("X", flatThenDrop, { estimates: est(2, 8) }), DEFAULT_ENGINE_SETTINGS);
    expect(a.signals.map((s) => s.kind)).toContain("VALUATION_COMPRESSION");
    expect(a.signals.map((s) => s.kind)).not.toContain("THESIS_DETERIORATION");
  });
  it("🔴 deterioração da tese: preço e estimativas caem", () => {
    const a = analyzeAsset(input("X", flatThenDrop, { estimates: est(-4, -9) }), DEFAULT_ENGINE_SETTINGS);
    expect(a.signals.map((s) => s.kind)).toContain("THESIS_DETERIORATION");
  });
  it("anti-FOMO após alta forte perto da máxima", () => {
    const rally = [...Array.from({ length: 230 }, () => 100), ...Array.from({ length: 30 }, (_, i) => 100 + i * 1.2)];
    const a = analyzeAsset(input("X", rally), DEFAULT_ENGINE_SETTINGS);
    expect(a.signals.map((s) => s.kind)).toContain("ANTI_FOMO");
  });
  it("tendência de estimativas a partir do histórico armazenado", () => {
    const e = est(null, null);
    const d = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const t = estimateTrend(e, [{ period: "+1y", as_of: d(35), eps_avg: 11, revenue_avg: null }]);
    expect(t.basis).toBe("stored-history");
    expect(t.direction).toBe("falling");
  });
});

describe("fair value", () => {
  it("exige ao menos duas estimativas", () => {
    const fv = fairValueView(100, null, null, { target_mean: 120, target_median: null, meta: meta() } as never, false);
    expect(fv.available).toBe(false);
  });
  it("não se aplica a ETF", () => {
    expect(fairValueView(100, null, null, null, true).reason).toMatch(/ETF/);
  });

  // Caso real NVDA: P/L histórico inflado por anos de lucro baixo + EPS do ano fiscal seguinte
  // levavam a "-64% (compra forte)". Agora (spec §10): EPS do ano corrente, P/L histórico limitado
  // pelo P/L que o crescimento e os juros da empresa justificam (DCF), e mediana dos métodos.
  const f = { pe_5y_avg: 60, eps_ttm: 4.5, forward_pe: null, fcf_per_share: 6, fcf_growth: 15, eps_growth_3y: 15, revenue_growth_3y: 15, beta: 1.2, sector: "Semiconductors", meta: meta() } as never;
  const trend = { eps_fy0: 6, eps_current: 9 } as never;
  const analysts = { target_mean: 230, meta: meta() } as never;
  it("múltiplo limitado pelo crescimento (não teto universal), cenários e mediana", () => {
    const fv = fairValueView(185, f, trend, analysts, false, 4.2);
    const dcf = fv.estimates.find((e) => e.method === "Fluxo de caixa descontado")!.value;
    const pe = dcf / 4.5;
    expect(pe).toBeLessThan(60);
    expect(fv.estimates.find((e) => e.method.startsWith("EPS 12m"))!.value).toBeCloseTo(4.5 * pe, 4);
    expect(fv.estimates.some((e) => /teto/.test(e.method))).toBe(false);
    expect(fv.scenarios!.pessimist).toBeLessThan(fv.scenarios!.base);
    expect(fv.scenarios!.optimist).toBeGreaterThan(fv.scenarios!.base);
    expect(fv.available).toBe(true);
  });
  it("fluxo de caixa e analistas muito divergentes → dados conflitantes, sem faixa (spec §22)", () => {
    const fv = fairValueView(185, { ...(f as object), fcf_per_share: 3.5 } as never, trend, analysts, false, 4.2);
    expect(fv.available).toBe(false);
    expect(fv.reason).toMatch(/conflitantes/);
  });
  it("sem DCF, usa o P/L histórico da própria empresa — e desconto implausível não vira faixa", () => {
    const fv = fairValueView(90, { ...(f as object), fcf_per_share: null, pfcf: null } as never, trend, analysts, false, 4.2);
    expect(fv.estimates.some((e) => e.method.includes("histórico"))).toBe(true);
    expect(fv.available).toBe(false);
    expect(fv.reason).toMatch(/longe demais/);
  });
  it("bancos/seguradoras: sem fluxo de caixa livre (spec §9)", () => {
    const fv = fairValueView(185, { ...(f as object), sector: "Banks" } as never, trend, analysts, false, 4.2);
    expect(fv.financial).toBe(true);
    expect(fv.estimates.some((e) => e.method === "Fluxo de caixa descontado")).toBe(false);
  });
});

describe("motor de alocação", () => {
  // Sem fundamentos nos fixtures: desliga o mínimo de data quality (testado à parte).
  const settings = { ...DEFAULT_ENGINE_SETTINGS, minDataQuality: 0 };

  it("bloqueia quando a qualidade dos dados é insuficiente", () => {
    const a = analyzeAsset(input("A", flat), DEFAULT_ENGINE_SETTINGS);
    const r = allocate({ contribution: 600, analyses: [a], values: { A: 0 }, existingOpportunityCash: 0, settings: DEFAULT_ENGINE_SETTINGS });
    expect(r.blocked).toBe(true);
    expect(r.blockReasons.join(" ")).toMatch(/Qualidade/);
  });
  const flat = Array.from({ length: 260 }, () => 100);

  it("prioriza o ativo abaixo do peso-alvo e nunca sugere venda", () => {
    const a = analyzeAsset(input("A", flat, { currentWeight: 70, targetWeight: 50 }), settings);
    const b = analyzeAsset(input("B", flat, { currentWeight: 30, targetWeight: 50 }), settings);
    const r = allocate({ contribution: 600, analyses: [a, b], values: { A: 7000, B: 3000 }, existingOpportunityCash: 0, settings });
    expect(r.blocked).toBe(false);
    const la = r.lines.find((l) => l.ticker === "A")!, lb = r.lines.find((l) => l.ticker === "B")!;
    expect(lb.amount).toBeGreaterThan(la.amount);
    expect(la.amount).toBeGreaterThanOrEqual(0);
    expect(Math.round((r.invested + r.opportunityCash) * 100)).toBe(60000);
    expect(lb.risks.length).toBeGreaterThan(0); // sempre há contra-argumento
  });

  it("não aloca em posição legada", () => {
    const a = analyzeAsset(input("A", flat, { currentWeight: 100, targetWeight: 100 }), settings);
    const voo = analyzeAsset(input("VOO", flat, { strategy: strategy("VOO", 0, { is_legacy: true, accepts_contributions: false }), currentWeight: 0, targetWeight: 0 }), settings);
    const r = allocate({ contribution: 500, analyses: [a, voo], values: { A: 1000, VOO: 5000 }, existingOpportunityCash: 0, settings });
    expect(r.lines.find((l) => l.ticker === "VOO")).toBeUndefined();
    expect(r.lines.find((l) => l.ticker === "A")!.amount).toBe(500);
  });

  it("bloqueia com dados desatualizados durante o pregão", () => {
    const old = new Date(Date.now() - 3600_000 * 200).toISOString();
    const a = analyzeAsset(input("A", flat, { quote: quote("A", 100, { timestamp: old }) }), settings);
    const b = analyzeAsset(input("B", flat, { quote: quote("B", 100, { timestamp: old }) }), settings);
    const r = allocate({ contribution: 600, analyses: [a, b], values: { A: 0, B: 0 }, existingOpportunityCash: 0, settings });
    expect(r.blocked).toBe(true);
    expect(r.blockReasons.join(" ")).toMatch(/desatualizados/);
  });

  it("AGUARDAR em deterioração de tese e caixa de oportunidade limitado a 20%", () => {
    const bad = analyzeAsset(input("A", flatThenDrop, { estimates: est(-5, -10), currentWeight: 40, targetWeight: 50 }), settings);
    const ok = analyzeAsset(input("B", flat, { currentWeight: 60, targetWeight: 50 }), settings);
    const r = allocate({ contribution: 600, analyses: [bad, ok], values: { A: 400, B: 600 }, existingOpportunityCash: 0, settings });
    expect(r.lines.find((l) => l.ticker === "A")!.action).toBe("AGUARDAR");
    expect(r.opportunityCash).toBeLessThanOrEqual(120);
    expect(r.opportunityCash).toBeGreaterThan(0);
  });

  it("respeita o valuation: caro (não aumentar) espera; oportunidade recebe mais com prioridade alta", () => {
    const a = analyzeAsset(input("A", flat, { currentWeight: 30, targetWeight: 33 }), settings);
    const b = analyzeAsset(input("B", flat, { currentWeight: 30, targetWeight: 33 }), settings);
    const c = analyzeAsset(input("C", flat, { currentWeight: 40, targetWeight: 34 }), settings);
    const r = allocate({ contribution: 600, analyses: [a, b, c], values: { A: 3000, B: 3000, C: 4000 }, existingOpportunityCash: 0, settings, stances: { A: "comprar", B: "manter", C: "nao_aumentar" } });
    const la = r.lines.find((l) => l.ticker === "A")!, lb = r.lines.find((l) => l.ticker === "B")!, lc = r.lines.find((l) => l.ticker === "C")!;
    expect(lc).toMatchObject({ amount: 0, action: "AGUARDAR", priority: "BAIXA" });
    expect(lc.why).toMatch(/não é momento de aumentar/);
    expect(la).toMatchObject({ action: "COMPRAR", priority: "ALTA" });
    expect(la.amount).toBeGreaterThan(lb.amount);
    expect(lb.priority).toBe("MÉDIA");
  });

  it("humor do mercado é contexto, não gatilho (spec §18): explica, mas não muda os valores", () => {
    const bad = analyzeAsset(input("A", flatThenDrop, { estimates: est(-5, -10), currentWeight: 40, targetWeight: 50 }), settings);
    const ok = analyzeAsset(input("B", flat, { currentWeight: 60, targetWeight: 50 }), settings);
    const run = (mood: "medo" | "normal" | "euforia") =>
      allocate({ contribution: 600, analyses: [bad, ok], values: { A: 400, B: 600 }, existingOpportunityCash: 0, settings, mood: { mood, reasons: ["teste"] }, stances: { B: "comprar" } });
    const normal = run("normal");
    for (const m of ["medo", "euforia"] as const) {
      const r = run(m);
      expect(r.opportunityCash).toBe(normal.opportunityCash);
      expect(r.lines.map((l) => l.amount)).toEqual(normal.lines.map((l) => l.amount));
      expect(r.notes.join(" ")).toMatch(/não muda a conta/);
    }
  });

  it("explica alternativas e o que faria mudar (spec §13)", () => {
    const a = analyzeAsset(input("A", flat, { currentWeight: 30, targetWeight: 50 }), settings);
    const b = analyzeAsset(input("B", flat, { currentWeight: 70, targetWeight: 50 }), settings);
    const r = allocate({ contribution: 600, analyses: [a, b], values: { A: 3000, B: 7000 }, existingOpportunityCash: 0, settings, stances: { A: "comprar", B: "nao_aumentar" } });
    const la = r.lines.find((l) => l.ticker === "A")!;
    expect(la.alternatives!.join(" ")).toMatch(/B/);
    expect(la.change).toMatch(/faixa atrativa/);
  });

  it("não acumula caixa além do limite", () => {
    const bad = analyzeAsset(input("A", flatThenDrop, { estimates: est(-5, -10), currentWeight: 40, targetWeight: 50 }), settings);
    const ok = analyzeAsset(input("B", flat, { currentWeight: 60, targetWeight: 50 }), settings);
    const r = allocate({ contribution: 600, analyses: [bad, ok], values: { A: 400, B: 600 }, existingOpportunityCash: 1200, settings });
    expect(r.opportunityCash).toBe(0);
  });
});
