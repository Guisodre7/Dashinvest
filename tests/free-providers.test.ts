import { describe, expect, it } from "vitest";
import { combineFx } from "@/lib/market/providers/brfx";
import { indicatorFromSeries, parseFredCsv } from "@/lib/market/providers/fred";
import { parseTiingoDividends, parseTiingoHistory, type TiingoRow } from "@/lib/market/providers/tiingo";

// Amostras no formato documentado de cada API.
const tiingo: TiingoRow[] = [
  { date: "2026-10-01T00:00:00.000Z", open: 100, high: 102, low: 99, close: 101, volume: 1000, adjOpen: 99, adjHigh: 101, adjLow: 98, adjClose: 100, divCash: 0, splitFactor: 1 },
  { date: "2026-10-02T00:00:00.000Z", open: 101, high: 104, low: 100, close: 103, volume: 1200, adjOpen: 101, adjHigh: 104, adjLow: 100, adjClose: 103, divCash: 0.62, splitFactor: 1 },
  { date: "2025-06-02T00:00:00.000Z", open: 90, high: 91, low: 89, close: 90, volume: 900, adjOpen: 88, adjHigh: 89, adjLow: 87, adjClose: 88, divCash: 0.5, splitFactor: 1 },
];

describe("Tiingo", () => {
  it("monta histórico ajustado em ordem cronológica, com data do último pregão", () => {
    const h = parseTiingoHistory("VOO", tiingo);
    expect(h.adjusted).toBe(true);
    expect(h.bars.map((b) => b.time)).toEqual(["2025-06-02", "2026-10-01", "2026-10-02"]);
    expect(h.bars[1].close).toBe(100); // usa adjClose, não close
    expect(h.meta.source).toBe("tiingo");
    expect(h.meta.timestamp.startsWith("2026-10-02")).toBe(true);
  });

  it("extrai proventos de divCash e soma só os últimos 12 meses", () => {
    const d = parseTiingoDividends("VOO", tiingo, new Date("2026-10-06T12:00:00Z"));
    expect(d.kind).toBe("distribution");
    expect(d.history[0]).toEqual({ ex_date: "2026-10-02", pay_date: null, amount: 0.62 });
    expect(d.trailing_12m).toBeCloseTo(0.62);
  });

  it("resposta vazia vira indisponível, nunca histórico inventado", () => {
    expect(() => parseTiingoHistory("XYZ", [])).toThrow();
  });
});

describe("Câmbio gratuito (AwesomeAPI + Banco Central)", () => {
  const sgs = Array.from({ length: 30 }, (_, i) => ({ data: `${String(i + 1).padStart(2, "0")}/09/2026`, valor: (5 + i * 0.01).toFixed(4) }));

  it("usa a cotação intradiária com o timestamp do fornecedor e a variação de 1 mês do BCB", () => {
    const fx = combineFx("USDBRL", { USDBRL: { bid: "5.4321", timestamp: "1791288000" } }, sgs);
    expect(fx.rate).toBe(5.4321);
    expect(fx.source).toBe("awesomeapi");
    expect(fx.timestamp).toBe(new Date(1791288000 * 1000).toISOString());
    const monthAgo = 5 + 8 * 0.01; // 22º valor a partir do fim
    expect(fx.change_1m).toBeCloseTo(((5.4321 - monthAgo) / monthAgo) * 100);
    expect(fx.is_realtime).toBe(false);
  });

  it("sem a AwesomeAPI, cai para o fechamento oficial do Banco Central", () => {
    const fx = combineFx("USDBRL", null, sgs);
    expect(fx.source).toBe("bcb-sgs");
    expect(fx.rate).toBeCloseTo(5.29);
    expect(fx.timestamp).toBe(new Date("2026-09-30T17:00:00-03:00").toISOString());
  });

  it("sem nenhuma fonte, lança erro em vez de inventar câmbio", () => {
    expect(() => combineFx("USDBRL", null, null)).toThrow();
  });
});

describe("FRED (CSV público)", () => {
  const csv = "observation_date,DGS10\n2026-09-29,4.10\n2026-09-30,.\n2026-10-01,4.15\n2026-10-02,4.20\n";

  it("ignora dias sem valor ('.') e ordena do mais recente", () => {
    expect(parseFredCsv(csv)).toEqual([
      { date: "2026-10-02", value: 4.2 }, { date: "2026-10-01", value: 4.15 }, { date: "2026-09-29", value: 4.1 },
    ]);
  });

  it("aceita o cabeçalho antigo (DATE) e monta o indicador com a fonte", () => {
    const m = indicatorFromSeries("US10Y", "Treasury 10 anos", parseFredCsv(csv.replace("observation_date", "DATE")));
    expect(m?.value).toBe(4.2);
    expect(m?.change).toBeCloseTo(0.05);
    expect(m?.meta?.source).toBe("fred");
  });
});
