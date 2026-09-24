import { describe, expect, it } from "vitest";
import { normalizeTrade } from "@/lib/ocr/normalize";
import { parseAmount, parseTradeText } from "@/lib/ocr/parseText";

const known = ["META", "NVDA", "MSFT", "AAPL", "GOOGL", "BRK.B", "JEPQ", "LQD", "VNQ", "VOO"];
const today = new Date("2026-09-24T12:00:00Z");

// Textos reais produzidos pelo OCR local (Tesseract.js) sobre comprovantes de teste.
const AVENUE = `Avenue\n\nOrdem executada\nCompra - NVDA\n\nNVIDIA Corporation\nQuantidade: 2,5\n\nPreço médio: US$ 180,00\nTaxas: US$ 0,00\n\nTotal: US$ 450,00\n\nData: 20/09/2026\n`;
const IBKR = `Interactive Brokers — Trade Confirmation\nBOUGHT 10 BRK B @ 480.25 USD\nCommission: 1.00 USD\n\nNet Amount: 4,803.50 USD\n\nTrade Date: 2026-09-18\n`;

describe("números pt-BR e en-US", () => {
  it.each([
    ["1.234,56", 1234.56], ["1,234.56", 1234.56], ["2,5", 2.5], ["0,125", 0.125], ["480.25", 480.25],
    ["1,250", 1250], ["1.250.000", 1250000], ["4,803.50", 4803.5], ["US$ 180,00", 180],
  ])("%s → %d", (s, v) => expect(parseAmount(s)).toBe(v));
});

describe("leitura por texto (OCR gratuito)", () => {
  it("Avenue em português", () => {
    const raw = parseTradeText(AVENUE, known);
    expect(raw).toMatchObject({ is_trade_confirmation: true, side: "buy", ticker: "NVDA", quantity: 2.5, price: 180, fees: 0, total_amount: 450, currency: "USD", trade_date: "2026-09-20", broker: "Avenue" });
    const n = normalizeTrade(raw, known, today);
    expect(n.warnings).toEqual([]);
  });

  it("Interactive Brokers em inglês, com 'BRK B @ preço'", () => {
    const raw = parseTradeText(IBKR, known);
    expect(raw).toMatchObject({ side: "buy", ticker: "BRK.B", quantity: 10, price: 480.25, fees: 1, total_amount: 4803.5, trade_date: "2026-09-18", broker: "Interactive Brokers" });
    const n = normalizeTrade(raw, known, today);
    expect(n.warnings).toEqual([]); // 10 × 480,25 = 4.802,50 + 1,00 de taxa = 4.803,50
  });

  it("formato americano com mês por extenso e frações", () => {
    const raw = parseTradeText("Nomad\nMarket Buy JEPQ\n0.8734 shares at $57.12\nExecuted Sep 19, 2026\nNo commission", known);
    expect(raw).toMatchObject({ ticker: "JEPQ", quantity: 0.8734, price: 57.12, fees: 0, side: "buy", trade_date: "2026-09-19", broker: "Nomad" });
  });

  it("não inventa: texto sem ordem não é comprovante", () => {
    const raw = parseTradeText("Bom dia! Seu extrato mensal está disponível.", known);
    expect(raw.is_trade_confirmation).toBe(false);
    expect(normalizeTrade(raw, known, today).filled).toEqual([]);
  });

  it("identifica venda e data ambígua", () => {
    const raw = parseTradeText("Venda MSFT\nQtd: 1\nPreço: US$ 510,00\nData: 03/04/2026", known);
    expect(raw.side).toBe("sell");
    expect(raw.trade_date).toBe("2026-04-03");
    expect(raw.notes).toMatch(/ambígua/);
  });
});

describe("casos encontrados no teste em navegador", () => {
  it("taxa de câmbio não é confundida com taxa da operação (nota em PDF)", () => {
    const text = "XP Investimentos — Nota de negociação internacional\nOperação: Compra\nAtivo: VNQ - Vanguard Real Estate ETF\nQuantidade: 3\nPreço unitário: US$ 92,40\nCorretagem: US$ 0,00\nValor total: US$ 277,20\nTaxa de câmbio: R$ 5,4210\nData do pregão: 18/09/2026";
    const raw = parseTradeText(text, known);
    expect(raw).toMatchObject({ ticker: "VNQ", quantity: 3, price: 92.4, fees: 0, total_amount: 277.2, fx_rate: 5.421, trade_date: "2026-09-18", broker: "XP" });
    expect(normalizeTrade(raw, known, today).warnings).toEqual([]);
  });

  it("texto de e-mail: 'N cotas de TICKER a US$ preço'", () => {
    const raw = parseTradeText("Sua ordem de compra foi executada: 1,5 cotas de MSFT a US$ 505,10 em 22/09/2026. Taxa: US$ 0,00. Nomad", known);
    expect(raw).toMatchObject({ ticker: "MSFT", quantity: 1.5, price: 505.1, fees: 0, trade_date: "2026-09-22", broker: "Nomad", side: "buy" });
  });
});
