import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AllocationView from "@/components/AllocationView";
import { allocate } from "@/lib/analysis/allocation";
import { analyzeAsset } from "@/lib/analysis/analyze";
import { DEFAULT_ENGINE_SETTINGS } from "@/lib/analysis/settings";
import { bars, meta, quote, strategy } from "./helpers";

describe("AllocationView", () => {
  it("renderiza linhas, explicação e contra-argumento", () => {
    const settings = { ...DEFAULT_ENGINE_SETTINGS, minDataQuality: 0 };
    const flat = Array.from({ length: 260 }, () => 100);
    const mk = (t: string, w: number) => analyzeAsset({
      ticker: t, name: t, isEtf: true, strategy: strategy(t, 50), quote: quote(t, 100),
      history: { ticker: t, bars: bars(flat), adjusted: true, meta: meta() }, fundamentals: null, estimates: null,
      estimateHistory: [], analysts: null, news: [], events: [], currentWeight: w, targetWeight: 50,
    }, settings);
    const r = allocate({ contribution: 600, analyses: [mk("A", 30), mk("B", 70)], values: { A: 300, B: 700 }, existingOpportunityCash: 0, settings });
    const html = renderToString(<AllocationView result={r} />);
    expect(html).toContain("Por que NÃO comprar?");
    expect(html).toContain("A decisão final é sua");
    expect(html).toMatch(/US\$ \d/);
  });
});
