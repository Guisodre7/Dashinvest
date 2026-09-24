import { describe, expect, it } from "vitest";
import { normalizeTicker, normalizeTrade, type RawTrade } from "@/lib/ocr/normalize";

const base: RawTrade = {
  is_trade_confirmation: true, side: "buy", ticker: "NVDA", company_name: "NVIDIA", quantity: 2.5, price: 180,
  gross_amount: 450, fees: 0, total_amount: 450, currency: "USD", trade_date: "2026-09-20", broker: "Avenue",
  fx_rate: null, notes: null,
};
const known = ["META", "NVDA", "BRK.B", "JEPQ"];
const today = new Date("2026-09-24T12:00:00Z");

describe("leitura de comprovante — normalização", () => {
  it("normaliza tickers", () => {
    expect(normalizeTicker("BRK B")).toBe("BRK.B");
    expect(normalizeTicker("brk-b")).toBe("BRK.B");
    expect(normalizeTicker("NASDAQ:NVDA")).toBe("NVDA");
    expect(normalizeTicker("Apple Inc")).toBeNull();
  });

  it("comprovante completo e consistente: sem avisos", () => {
    const r = normalizeTrade(base, known, today);
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([]);
    expect(r.draft).toMatchObject({ ticker: "NVDA", quantity: 2.5, price: 180, fees: 0, trade_date: "2026-09-20", broker: "Avenue" });
    expect(r.filled).toEqual(expect.arrayContaining(["ticker", "quantity", "price", "fees", "trade_date", "broker"]));
  });

  it("não é comprovante → nada preenchido", () => {
    const r = normalizeTrade({ ...base, is_trade_confirmation: false }, known, today);
    expect(r.ok).toBe(false);
    expect(r.filled).toEqual([]);
  });

  it("calcula preço só quando quantidade e valor bruto estão explícitos, avisando", () => {
    const r = normalizeTrade({ ...base, price: null }, known, today);
    expect(r.draft.price).toBe(180);
    expect(r.warnings.join(" ")).toMatch(/calculado/);
  });

  it("aponta inconsistência entre quantidade × preço e o valor do comprovante", () => {
    const r = normalizeTrade({ ...base, gross_amount: 500, total_amount: 500 }, known, today);
    expect(r.warnings.join(" ")).toMatch(/difere/);
  });

  it("avisa venda, ticker não cadastrado, moeda BRL e data futura", () => {
    const r = normalizeTrade({ ...base, side: "sell", ticker: "AMZN", currency: "BRL", trade_date: "2027-01-10" }, known, today);
    const w = r.warnings.join(" ");
    expect(w).toMatch(/VENDA/);
    expect(w).toMatch(/AMZN não está cadastrado/);
    expect(w).toMatch(/BRL/);
    expect(r.draft.trade_date).toBeNull();
  });

  it("descarta câmbio fora da faixa R$/US$ e valores inválidos", () => {
    const r = normalizeTrade({ ...base, fx_rate: 0.19, quantity: -3, fees: -1, gross_amount: null, total_amount: null }, known, today);
    expect(r.draft.fx_rate).toBeNull();
    expect(r.draft.quantity).toBeNull();
    expect(r.draft.fees).toBeNull();
    expect(r.warnings[0]).toMatch(/incompleta/);
  });
});
