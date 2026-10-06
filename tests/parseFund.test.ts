import { describe, expect, it } from "vitest";
import { parseFundPosition } from "@/lib/ocr/parseFund";

// Texto exato do OCR local (Tesseract) do print real do app do BTG.
const BTG = `11:00 LER 48 )
SG O
BTG Pactual Credito Bancario
FIRF CrPr RL
Renda Fixa
Saldo bruto R$ 9.445,32
Saldo líquido R$ 9.406,66
Rendimento total R$116,58
Valor investido R$ 9.290,08
Posição por compra Objetivo Característ
O Cotação atual: R$ 1,11, atualizada em
06/10/2026
Data da compra Valor investido
30/09/2026 R$ 3.000,00 >
`;

describe("print de posição em fundo", () => {
  const today = new Date("2026-10-06T15:00:00Z");

  it("lê o print do BTG e confere os números entre si", () => {
    const f = parseFundPosition(BTG, today);
    expect(f.name).toBe("BTG Pactual Credito Bancario FIRF CrPr RL");
    expect(f.category).toBe("Renda Fixa");
    expect(f.grossBalance).toBe(9445.32);
    expect(f.netBalance).toBe(9406.66);
    expect(f.income).toBe(116.58);
    expect(f.invested).toBe(9290.08);
    expect(f.quotaPrice).toBe(1.11);
    expect(f.asOf).toBe("2026-10-06");
    expect(f.lots).toEqual([{ date: "2026-09-30", amount: 3000 }]);
    expect(f.creditPrivate).toBe(true);
    expect(f.verified).toBe(true);
    expect(f.warnings).toEqual([]);
  });

  it("número inconsistente → não confirmado (nunca salva sem revisão)", () => {
    const f = parseFundPosition(BTG.replace("9.290,08", "9.200,08"), today);
    expect(f.verified).toBe(false);
    expect(f.warnings.join(" ")).toMatch(/não fecham/);
  });

  it("outros rótulos de bancos e CNPJ", () => {
    const f = parseFundPosition(`Itaú Privilège RF DI\nRenda Fixa\nCNPJ 12.345.678/0001-90\nValor aplicado R$ 1.000,00\nSaldo atual R$ 1.010,50\nPosição em 05/10/2026`, today);
    expect(f.cnpj).toBe("12345678000190");
    expect(f.invested).toBe(1000);
    expect(f.grossBalance).toBe(1010.5);
    expect(f.asOf).toBe("2026-10-05");
    expect(f.verified).toBe(false); // sem rendimento informado para conferir
  });

  it("texto que não é posição → campos vazios, sem inventar", () => {
    const f = parseFundPosition("Olá, tudo bem?", today);
    expect(f.name).toBeNull();
    expect(f.invested).toBeNull();
    expect(f.verified).toBe(false);
  });
});

import { applyEntry, type Holding } from "@/lib/portfolio/ledger";
import { matchHolding, planFundImport, type FundImportInput } from "@/lib/portfolio/fundImport";

describe("importar print de fundo na carteira Brasil", () => {
  const input: FundImportInput = {
    name: "BTG Pactual Credito Bancario FIRF CrPr RL", cnpj: null, invested: 9290.08, grossBalance: 9445.32, netBalance: 9406.66,
    asOf: "2026-10-06", lots: [{ date: "2026-09-30", amount: 3000 }], use: "net", creditPrivate: true,
  };
  const apply = (h: Holding | null, entries: ReturnType<typeof planFundImport>["entries"]) => entries.reduce<Holding | null>((acc, e) => applyEntry(acc, e).holding, h)!;

  it("primeiro print: aporte do valor investido + saldo líquido; ganho = rendimento do banco", () => {
    const plan = planFundImport(null, input);
    expect(plan.isNew).toBe(true);
    expect(plan.entries.map((e) => e.kind)).toEqual(["contribution", "balance"]); // compras listadas não somam o total
    const h = apply(null, plan.entries);
    expect(h.cost_basis).toBeCloseTo(9290.08);
    expect(h.current_value).toBeCloseTo(9406.66);
    expect(h.current_value! - h.cost_basis).toBeCloseTo(116.58); // = "Rendimento total" do print
  });

  it("print seguinte com novo aporte: diferença do investido é APORTE, não rentabilidade", () => {
    const h0 = apply(null, planFundImport(null, input).entries);
    const plan = planFundImport(h0, { ...input, invested: 9790.08, netBalance: 9912.0, asOf: "2026-10-20" });
    expect(plan.entries.map((e) => e.kind)).toEqual(["contribution", "balance"]);
    expect(plan.entries[0].amount).toBeCloseTo(500);
    expect(plan.changes[0]).toMatch(/Aporte detectado: \+R\$ 500,00/);
    const h1 = apply(h0, plan.entries);
    expect(h1.current_value! - h1.cost_basis).toBeCloseTo(9912 - 9790.08);
  });

  it("mesmo print de novo: nada muda; investido menor: pede o resgate", () => {
    const h0 = apply(null, planFundImport(null, input).entries);
    expect(planFundImport(h0, input).nothingChanged).toBe(true);
    expect(planFundImport(h0, { ...input, invested: 8000, asOf: "2026-10-20" }).blocker).toMatch(/resgate/);
  });

  it("encontra a posição pelo CNPJ ou pelo nome", () => {
    const h0 = { ...apply(null, planFundImport(null, input).entries), cnpj: "12345678000190" };
    expect(matchHolding([h0], { name: "Outro nome", cnpj: "12345678000190" })?.code).toBe(h0.code);
    expect(matchHolding([h0], { name: "BTG Pactual Credito Bancario FIRF CrPr RL", cnpj: null })?.code).toBe(h0.code);
    expect(matchHolding([h0], { name: "Fundo X", cnpj: null })).toBeNull();
  });
});
