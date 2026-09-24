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
