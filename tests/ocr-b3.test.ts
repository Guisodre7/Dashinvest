import { describe, expect, it } from "vitest";
import { parseTradeText } from "@/lib/ocr/parseText";
import { b3Draft } from "@/lib/ocr/b3";

// Texto como o OCR lê a tela "Detalhes da operação" de uma corretora brasileira.
const ITUB = `13:45
Detalhes da operação
ITUB4 R$ 41,47
Itaú Unibanco -0,55%
Aberta
Negociar
Cancelar todas as ordens Zerar posição Inverter
Abertura 12h06
Fechamento -
Lado Compra
Volume de compra R$ 416,50
Quantidade comprada 10
Preço de compra R$ 41,65
Volume de venda R$ 0,00
Quantidade vendida 0
Preço de venda R$ 0,00
TET -`;

describe("print de corretora brasileira", () => {
  it("compra no fracionário: lado, ticker, quantidade, preço, total e moeda", () => {
    const r = parseTradeText(ITUB.replace("ITUB4 R$", "ITUB4F R$"), ["PETR4"]);
    expect(r).toMatchObject({ side: "buy", ticker: "ITUB4", quantity: 10, price: 41.65, gross_amount: 416.5, currency: "BRL" });
    const d = b3Draft(r, ["ITUB4"], "buy");
    expect(d.fields).toMatchObject({ code: "ITUB4", quantity: 10, price: 41.65 });
    expect(d.checks.join(" ")).toMatch(/confere/);
    expect(d.warnings).toEqual([]);
  });

  it("venda: usa os campos de venda, não os de compra zerados", () => {
    const sell = ITUB.replace("Lado Compra", "Lado Venda")
      .replace("Volume de compra R$ 416,50", "Volume de compra R$ 0,00").replace("Quantidade comprada 10", "Quantidade comprada 0").replace("Preço de compra R$ 41,65", "Preço de compra R$ 0,00")
      .replace("Volume de venda R$ 0,00", "Volume de venda R$ 210,00").replace("Quantidade vendida 0", "Quantidade vendida 5").replace("Preço de venda R$ 0,00", "Preço de venda R$ 42,00");
    const r = parseTradeText(sell, ["ITUB4"]);
    expect(r).toMatchObject({ side: "sell", quantity: 5, price: 42, gross_amount: 210 });
  });

  it("print de venda na aba de compra gera aviso (nada é salvo sozinho)", () => {
    const r = parseTradeText(ITUB.replace("Lado Compra", "Lado Venda"), ["ITUB4"]);
    expect(b3Draft(r, ["ITUB4"], "buy").warnings.join(" ")).toMatch(/venda/i);
  });

  it("total que não bate com quantidade × preço vira aviso", () => {
    const r = parseTradeText(ITUB.replace("R$ 416,50", "R$ 999,00"), ["ITUB4"]);
    expect(b3Draft(r, ["ITUB4"], "buy").warnings.join(" ")).toMatch(/não bate/);
  });
});
