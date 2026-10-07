import { afterEach, describe, expect, it, vi } from "vitest";
import { quoteFreshness } from "@/lib/market/freshness";
import { quoteFromHistory } from "@/lib/market/historyQuote";
import { FinnhubProvider } from "@/lib/market/providers/finnhub";
import { parseTiingoHistory } from "@/lib/market/providers/tiingo";

afterEach(() => vi.unstubAllGlobals());

describe("cotação de reserva pelo último fechamento", () => {
  const h = parseTiingoHistory("MSFT", [
    { date: "2026-10-05T00:00:00.000Z", open: 500, high: 505, low: 495, close: 502, volume: 10, adjOpen: 500, adjHigh: 505, adjLow: 495, adjClose: 502, divCash: 0, splitFactor: 1 },
    { date: "2026-10-06T00:00:00.000Z", open: 502, high: 512, low: 500, close: 510, volume: 12, adjOpen: 502, adjHigh: 512, adjLow: 500, adjClose: 510, divCash: 0, splitFactor: 1 },
  ]);

  it("usa o fechamento com a data real e marca que não é tempo real", () => {
    const q = quoteFromHistory("MSFT", h)!;
    expect(q.price).toBe(510);
    expect(q.prev_close).toBe(502);
    expect(q.meta.is_realtime).toBe(false);
    expect(q.meta.source).toMatch(/fechamento de 2026-10-06/);
    expect(q.meta.timestamp.startsWith("2026-10-06")).toBe(true);
  });

  it("com mercado aberto no dia seguinte: atrasada (mostrada com a idade), mas não bloqueia a decisão", () => {
    const f = quoteFreshness(quoteFromHistory("MSFT", h)!.meta, new Date("2026-10-07T15:03:00Z"));
    expect(f.level).toBe("delayed");
    expect(f.blocksPriceDecisions).toBe(false);
    expect(f.label).toMatch(/não é tempo real/);
  });

  it("sem histórico, sem cotação (nada inventado)", () => {
    expect(quoteFromHistory("MSFT", null)).toBeNull();
  });
});

describe("Finnhub no plano gratuito", () => {
  it("não chama endpoints pagos (que estouravam o limite de 60/min)", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => {
      urls.push(String(u));
      return new Response(JSON.stringify([{ period: "2026-10-01", strongBuy: 1, buy: 2, hold: 0, sell: 0, strongSell: 0 }]), { status: 200 });
    });
    const a = await new FinnhubProvider("k", true, false).getAnalystData("ZZZ1");
    expect(a.target_mean).toBeNull();
    expect(urls.some((u) => /price-target|upgrade-downgrade/.test(u))).toBe(false);
    expect(urls.some((u) => u.includes("/stock/recommendation"))).toBe(true);
  });
});
