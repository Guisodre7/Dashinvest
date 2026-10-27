
import { describe, expect, it } from "vitest";
import { matchFundByName, parseFundList } from "@/lib/ocr/parseFund";

// Texto real do OCR (tesseract, por+eng) do print da lista de fundos do app do BTG.
const BTG = `14:31 wl @
&
Ordenar por Agrupar por
Rentabilidade v Nenhum v
BTG Pactual Credito Bancario FIRF CrPr RL
Renda Fixa
Saldo bruto R$ 9.514,38
Saldo líquido R$ 9.461,74
Resgate D+0
Rent. més atual 0,88%
Mais detalhes >
BTG Yield DI FIRF Ref CrPr
Renda Fixa
Saldo bruto R$ 3.759,90
Saldo liquido R$ 3.738,65
Resgate D+0
Rent. més atual 0,85%
Mais detalhes >`;

describe("print da lista de fundos", () => {
  it("lê os dois fundos com saldo bruto e líquido", () => {
    expect(parseFundList(BTG)).toEqual([
      { name: "BTG Pactual Credito Bancario FIRF CrPr RL", grossBalance: 9514.38, netBalance: 9461.74 },
      { name: "BTG Yield DI FIRF Ref CrPr", grossBalance: 3759.9, netBalance: 3738.65 },
    ]);
  });

  it("casa cada um com o fundo cadastrado, sem confundir os dois", () => {
    const funds = [
      { code: "btg-pactual-credito-bancario-firf-crpr-rl", name: "BTG Pactual Credito Bancario FIRF CrPr RL" },
      { code: "btg-yield-di-firf-ref-crpr", name: "BTG Yield DI FIRF Ref CrPr" },
    ];
    const [a, b] = parseFundList(BTG);
    expect(matchFundByName(a.name, funds)?.code).toBe(funds[0].code);
    expect(matchFundByName(b.name, funds)?.code).toBe(funds[1].code);
    expect(matchFundByName("XP Selection FIA", funds)).toBeNull();
  });
});
