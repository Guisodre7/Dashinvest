import { describe, expect, it } from "vitest";
import { normalizeTrade } from "@/lib/ocr/normalize";
import { parseTradeText } from "@/lib/ocr/parseText";

// Texto EXATO produzido pelo OCR local (Tesseract.js) sobre os prints reais do usuário.
const RESUMO = `Comprade 0.13979299
quantidade de VOO a $708.19
Em 19/08/2026, as 10:30:30
Valor total
- US$ 100,00
Compra de 0.13979299 quantidade de VOO a
$708.19
-US$ 99,00
Tarifas e corretagem
- US$ 1,00

Tipo da transação

Ordem

B Número da transação
NHKH244553
Ver detalhes da ordem
`;

const DETALHES = `09:38 ot EC

E
VOO
S&P 500 Vanguard ETF
Status O Executada
Direção da ordem Compra
Preço A mercado
Valor US$ 99,00
Última atualização 19/08/26, às 10:30:00

Detalhes da ordem Histórico
ID da ordem NHKH244553
Tipo da ordem a Mercado
Tipo de execução Valor
Quantidade executada 0,13979299
Quantidade restante 0
Preço médio O US$ 708,19
Taxa de corretagem US$ 1,00
Validade da ordem 19/08/2026
`;

const known = ["META", "NVDA", "MSFT", "AAPL", "GOOGL", "BRK.B", "JEPQ", "LQD", "VNQ", "VOO"];
const today = new Date("2026-09-25T12:00:00Z");
const expected = { ticker: "VOO", quantity: 0.13979299, price: 708.19, fees: 1, trade_date: "2026-08-19", side: "buy", trade_id: "NHKH244553" };

describe("prints reais da corretora do usuário", () => {
  it("resumo da transação (recomendado): tudo lido e conferido", () => {
    const raw = parseTradeText(RESUMO, known);
    expect(raw).toMatchObject({ ...expected, total_amount: 100 });
    const n = normalizeTrade(raw, known, today);
    expect(n.warnings).toEqual([]);
    expect(n.verified).toBe(true); // 0,13979299 × 708,19 = 99,00 = 100,00 − 1,00
  });

  it("detalhes da ordem: também lido e conferido (preço 'A mercado' ignorado)", () => {
    const raw = parseTradeText(DETALHES, known);
    expect(raw).toMatchObject({ ...expected, gross_amount: 99 });
    const n = normalizeTrade(raw, known, today);
    expect(n.warnings).toEqual([]);
    expect(n.verified).toBe(true);
  });

  it("sem conferência de valor não há registro automático", () => {
    const raw = parseTradeText("Compra de 2 quantidade de VOO a $700.00\nEm 19/08/2026", known);
    const n = normalizeTrade(raw, known, today);
    expect(n.draft.quantity).toBe(2);
    expect(n.verified).toBe(false);
  });
});
