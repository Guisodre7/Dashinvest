import { describe, expect, it } from "vitest";
import { brCandidates, macroCandidates, usCandidates } from "@/lib/notify/candidates";
import { DEFAULT_PREFS, decide, groupPushes, inQuietHours, parsePrefs, type Candidate, type NotifyPrefs, type SentRecord } from "@/lib/notify/rules";
import type { AssetAnalysis } from "@/lib/analysis/analyze";
import type { PortfolioLedgerSummary } from "@/lib/portfolio/ledger";

const on: NotifyPrefs = { ...DEFAULT_PREFS, pushEnabled: true };
// 15h em Brasília (18h UTC) — fora do silêncio.
const day = new Date("2026-10-06T18:00:00Z");
const night = new Date("2026-10-07T02:00:00Z"); // 23h em Brasília

const cand = (over: Partial<Candidate> = {}): Candidate => ({
  category: "opportunity", priority: "high", market: "US", ticker: "NVDA", title: "Oportunidade: NVDA",
  body: "NVDA entrou em faixa de análise (P/L 28).", publicBody: "NVDA entrou em faixa considerada interessante.",
  reason: "teste", url: "/ativo/NVDA", key: "NVDA:opportunity", ...over,
});
const sent = (key: string, hoursAgo: number, over: Partial<SentRecord> = {}): SentRecord => ({
  dedupe_key: key, category: "opportunity", priority: "high", ticker: "NVDA", delivery: "sent",
  created_at: new Date(day.getTime() - hoursAgo * 3_600_000).toISOString(), ...over,
});

function analysis(over: Partial<AssetAnalysis>): AssetAnalysis {
  return { ticker: "META", signals: [], news: [], events: [], daysToEarnings: null, trend: { eps_rev_30d: null, period: "0y" }, ...over } as unknown as AssetAnalysis;
}

describe("regras de notificação", () => {
  it("horário de silêncio 22h–07h em Brasília", () => {
    expect(inQuietHours(day, DEFAULT_PREFS.quiet)).toBe(false);
    expect(inQuietHours(night, DEFAULT_PREFS.quiet)).toBe(true);
    expect(inQuietHours(new Date("2026-10-07T10:30:00Z"), DEFAULT_PREFS.quiet)).toBe(false); // 07:30
    expect(inQuietHours(night, { ...DEFAULT_PREFS.quiet, enabled: false })).toBe(false);
  });

  it("no silêncio: comum fica na central; crítico toca se permitido", () => {
    const d = decide([cand(), cand({ key: "X:thesis", category: "thesis", priority: "critical" })], on, [], night);
    expect(d.find((x) => x.key === "NVDA:opportunity")?.delivery).toBe("quiet");
    expect(d.find((x) => x.key === "X:thesis")?.delivery).toBe("sent");
    const strict = decide([cand({ key: "X:thesis", category: "thesis", priority: "critical" })], { ...on, quiet: { ...on.quiet, allowCritical: false } }, [], night);
    expect(strict[0].delivery).toBe("quiet");
  });

  it("cooldown: mesmo estado não repete em 7 dias, salvo se a prioridade subir", () => {
    expect(decide([cand()], on, [sent("NVDA:opportunity", 24)], day)).toHaveLength(0);
    expect(decide([cand()], on, [sent("NVDA:opportunity", 8 * 24)], day)).toHaveLength(1);
    const escalated = decide([cand({ priority: "critical" })], on, [sent("NVDA:opportunity", 1)], day);
    expect(escalated).toHaveLength(1);
  });

  it("notícia (cooldown 0) nunca repete a mesma notícia", () => {
    const news = cand({ category: "news", key: "NVDA:news:abc" });
    expect(decide([news], on, [sent("NVDA:news:abc", 24 * 30, { category: "news" })], day)).toHaveLength(0);
  });

  it("categoria ou mercado desligado: descartado; push desligado: só central", () => {
    expect(decide([cand()], { ...on, categories: { ...on.categories, opportunity: false } }, [], day)).toHaveLength(0);
    expect(decide([cand()], { ...on, markets: { BR: true, US: false } }, [], day)).toHaveLength(0);
    expect(decide([cand()], DEFAULT_PREFS, [], day)[0].delivery).toBe("in_app");
  });

  it("realização e recompra são categorias ativas (desligáveis)", () => {
    expect(decide([cand({ category: "realization", key: "R" })], on, [], day)).toHaveLength(1);
    expect(decide([cand({ category: "rebuy", key: "R" })], { ...on, categories: { ...on.categories, rebuy: false } }, [], day)).toHaveLength(0);
  });

  it("teto diário: excedente vai só para a central; crítico sempre passa", () => {
    const history = Array.from({ length: 6 }, (_, i) => sent(`K${i}`, 1));
    const d = decide([cand(), cand({ key: "C", category: "thesis", priority: "critical" })], on, history, day);
    expect(d.find((x) => x.key === "NVDA:opportunity")?.delivery).toBe("in_app");
    expect(d.find((x) => x.key === "C")?.delivery).toBe("sent");
  });

  it("agrupa mais de 2 pushes em um só e esconde valores na tela bloqueada", () => {
    const d = decide([cand({ key: "A", ticker: "A" }), cand({ key: "B", ticker: "B" }), cand({ key: "C", ticker: "C" })], on, [], day);
    const msgs = groupPushes(d, true, "r1");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].title).toMatch(/3 atualizações/);
    expect(msgs[0].url).toBe("/notificacoes");
    expect(d.every((x) => x.group_key === "grp-r1")).toBe(true);
    const single = groupPushes(decide([cand()], on, [], day), true, "r2");
    expect(single[0].body).not.toMatch(/P\/L 28/);
    expect(groupPushes(decide([cand()], on, [], day), false, "r3")[0].body).toMatch(/P\/L 28/);
  });

  it("preferências inválidas voltam ao padrão (silêncio 22h–07h, valores ocultos)", () => {
    const p = parsePrefs({ quiet: { start: "25:00" }, dailyLimit: 999 });
    expect(p.quiet.start).toBe("22:00");
    expect(p.dailyLimit).toBe(6);
    expect(p.hideValues).toBe(true);
    expect(p.categories.market).toBe(false);
  });
});

describe("candidatos", () => {
  it("oscilação de preço sozinha não gera notificação", () => {
    expect(usCandidates([analysis({ quote: { change_pct: 3 } as never })], day)).toHaveLength(0);
    expect(usCandidates([analysis({ quote: { change_pct: 30 } as never })], day)).toHaveLength(0);
  });

  it("alta acompanhada por estimativas (anti-FOMO baixo) não alerta; sem acompanhamento, alerta", () => {
    const fomo = (severity: string) => analysis({ signals: [{ kind: "ANTI_FOMO", severity, tone: "negative", title: "Forte expansão", message: "m" }] as never });
    expect(usCandidates([fomo("LOW")], day)).toHaveLength(0);
    expect(usCandidates([fomo("MEDIUM")], day)[0].category).toBe("valuation");
  });

  it("notícia antiga nunca é tratada como atual; notícia recente separa fato e interpretação", () => {
    const news = (hoursAgo: number) => analysis({ news: [{ id: "n1", title: "Meta anuncia aquisição", source: "Reuters", published_at: new Date(day.getTime() - hoursAgo * 3_600_000).toISOString(), impact: "CRITICAL", category: "M&A", impact_reasons: ["aquisição"] }] as never });
    expect(usCandidates([news(72)], day)).toHaveLength(0);
    const c = usCandidates([news(3)], day)[0];
    expect(c.body).toMatch(/^FATO: .*INTERPRETAÇÃO DO MODELO/);
    expect(c.url).toBe("/ativo/META");
  });

  it("carteira Brasil: renda fixa 72% com meta 50% sugere priorizar ações e FIIs", () => {
    const summary = {
      currentValue: 10000,
      classes: [
        { asset_class: "renda_fixa", value: 7200, weight: 72, target: 50, gap: 22, toTarget: -2200 },
        { asset_class: "acao", value: 1800, weight: 18, target: 25, gap: -7, toTarget: 700 },
        { asset_class: "fii", value: 1000, weight: 10, target: 25, gap: -15, toTarget: 1500 },
      ],
    } as unknown as PortfolioLedgerSummary;
    const cs = brCandidates(summary);
    const rf = cs.find((c) => c.key.includes("renda_fixa"))!;
    expect(rf.body).toBe("Renda fixa representa 72% da carteira. Sua meta atual é 50%. O próximo aporte pode priorizar ações e FIIs.");
    expect(rf.url).toBe("/brasil");
    expect(cs.some((c) => c.key.includes("fii:under"))).toBe(true);
  });

  it("macro: só mudanças grandes", () => {
    const m = (change_1m: number) => [{ key: "US10Y", label: "", value: 4.6, change: 0, change_pct: null, change_1m, unit: "percent", proxy: null, meta: null }] as never;
    expect(macroCandidates(m(0.2))).toHaveLength(0);
    expect(macroCandidates(m(0.6))[0].title).toMatch(/subiram 0,60 p\.p\./);
  });
});

describe("candidatos de valuation e escada", async () => {
  const { stanceCandidates, ladderCandidates } = await import("@/lib/notify/candidates");
  const { computeStance, DEFAULT_TAX } = await import("@/lib/analysis/stance");
  const st = (over: object) => computeStance({
    ticker: "META", isEtf: false, isLegacy: false, price: 104, fair: { low: 70, mean: 80, high: 90, basis: "fair-value" },
    qualityScore: 82, qualityCoverage: 0.9, signalKinds: [], estimates: { direction: "stable", significantCut: false, epsRev90d: 0 },
    priceChange6m: 5, weight: 30, target: 10, maxWeight: 15, position: { quantity: 100, avgCost: 60, value: 10400 }, lastSell: null,
    tax: DEFAULT_TAX.US, currency: "US$", ...over,
  });
  it("realização parcial e recompra viram notificações com deep link para a análise", () => {
    const r = stanceCandidates([st({})]);
    expect(r[0]).toMatchObject({ category: "realization", title: "Valuation esticado: META", url: "/ativo/META#realizacao" });
    expect(r[0].publicBody).toMatch(/Avaliar realização parcial/);
    const b = stanceCandidates([st({ price: 66, weight: 8, lastSell: { date: "2026-03-01", price: 100, quantity: 20 } })]);
    expect(b[0]).toMatchObject({ category: "rebuy", title: "Possível recompra: META" });
  });
  it("degraus da escada: venda só com posição; recompra só depois de vender", () => {
    const l = { META: { sell: [{ price: 700, pct: 10 }, { price: 800, pct: 10 }], rebuy: [{ price: 550, pct: 25 }], updated_at: "2026-09-01T10:00:00Z" } };
    const ctx = (held: boolean, sold: string | null) => ({ held: () => held, lastSellDate: () => sold });
    expect(ladderCandidates(l, { META: 720 }, ctx(true, null)).map((c) => c.key)).toEqual(["META:ladder:sell:700"]);
    expect(ladderCandidates(l, { META: 720 }, ctx(false, null))).toHaveLength(0);
    expect(ladderCandidates(l, { META: 540 }, ctx(true, null))).toHaveLength(0); // nunca vendeu
    expect(ladderCandidates(l, { META: 540 }, ctx(true, "2026-08-01"))).toHaveLength(0); // venda antes do plano
    expect(ladderCandidates(l, { META: 540 }, ctx(true, "2026-09-10")).map((c) => c.key)).toEqual(["META:ladder:rebuy:550"]);
    expect(ladderCandidates(l, { META: 600 }, ctx(true, "2026-09-10"))).toHaveLength(0);
  });
});
