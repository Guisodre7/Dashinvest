import { describe, expect, it } from "vitest";
import { parseDividendText } from "@/lib/ocr/parseDividend";

const TICKERS = ["META", "NVDA", "MSFT", "AAPL", "GOOGL", "BRK.B", "JEPQ", "LQD", "VNQ", "VOO"];
const today = new Date("2026-10-06T12:00:00Z");

describe("comprovante de dividendo", () => {
  it("formato pt-BR (corretora)", () => {
    const d = parseDividendText("Dividendos recebidos\nAtivo: AAPL\nQuantidade 2\nValor por ação US$ 0,26\nValor bruto US$ 0,52\nImposto retido US$ 0,16\nValor líquido US$ 0,36\nData de pagamento 14/08/2026", TICKERS, today);
    expect(d).toMatchObject({ ticker: "AAPL", kind: "dividend", gross: 0.52, tax: 0.16, net: 0.36, perShare: 0.26, quantity: 2, payDate: "2026-08-14", verified: true });
  });

  it("formato em inglês, ETF vira distribuição, imposto calculado só quando determinado", () => {
    const d = parseDividendText("Dividend payment JEPQ\nGross amount $12.40\nNet amount $8.68\nPay date 2026-09-03", TICKERS, today);
    expect(d).toMatchObject({ ticker: "JEPQ", kind: "distribution", gross: 12.4, net: 8.68, tax: 3.72, payDate: "2026-09-03", verified: true });
  });

  it("números que não fecham ou ativo desconhecido → não confirmado", () => {
    expect(parseDividendText("AAPL Valor bruto US$ 1,00 Imposto US$ 0,30 Valor líquido US$ 0,50 Pagamento 01/09/2026", TICKERS, today).verified).toBe(false);
    expect(parseDividendText("Dividendo XYZW valor bruto 10,00", TICKERS, today).ticker).toBeNull();
  });

  it("BRK B com espaço", () => {
    expect(parseDividendText("BRK B dividend Gross $1.00", TICKERS, today).ticker).toBe("BRK.B");
  });
});
