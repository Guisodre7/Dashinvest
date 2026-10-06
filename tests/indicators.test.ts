import { describe, expect, it } from "vitest";
import { computeDrawdown, drawdownBand, rsi, sma } from "@/lib/analysis/indicators";
import { bars } from "./helpers";

describe("indicadores", () => {
  it("SMA simples", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
  it("RSI 100 em série só de altas", () => {
    expect(rsi(Array.from({ length: 30 }, (_, i) => 100 + i))).toBe(100);
  });
  it("faixas de drawdown", () => {
    expect(drawdownBand(-3)).toBe("0-5%");
    expect(drawdownBand(-12)).toBe("10-15%");
    expect(drawdownBand(-35)).toBe(">30%");
  });
  it("drawdown da máxima de 52 semanas", () => {
    const closes = [...Array.from({ length: 250 }, (_, i) => 100 + i * 0.1), 100];
    const dd = computeDrawdown(bars(closes), 100);
    expect(dd.from_52w_high).toBeLessThan(-19);
    expect(dd.band).toBe("20-30%");
  });
});

describe("máxima de 52 semanas incoerente do fornecedor", () => {
  it("BRK.B com a máxima da classe A (US$ 760 mil) é descartada em favor do histórico", async () => {
    const { computeDrawdown } = await import("@/lib/analysis/indicators");
    const bars = Array.from({ length: 250 }, (_, i) => ({ time: `d${i}`, open: 480, high: 500 + (i === 100 ? 30 : 0), low: 470, close: 490, volume: 1 }));
    const dd = computeDrawdown(bars, 507, { week52High: 760_000, week52Low: 470 });
    expect(dd.from_52w_high).toBeCloseTo((507 / 530 - 1) * 100, 1);
    const noHist = computeDrawdown([], 507, { week52High: 760_000, week52Low: 400 });
    expect(noHist.from_52w_high).toBeNull();
  });
});
