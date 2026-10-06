import { describe, expect, it } from "vitest";
import { brFair, brQuality } from "@/lib/analysis/brValuation";
import { brNumber, parseFundamentus, type BrFundamentals } from "@/lib/market/parseFundamentus";

// Estrutura da página de detalhes do Fundamentus (rótulo/valor em células label/data).
const cell = (label: string, value: string) =>
  `<td class="label w2"><span class="help tips" title="x">?</span><span class="txt">${label}</span></td><td class="data w2"><span class="txt">${value}</span></td>`;
const ACAO = `<table>${[
  ["Papel", "ITUB4"], ["Cotação", "38,12"], ["Empresa", "ITAU UNIBANCO PN"], ["Setor", "Intermediários Financeiros"], ["Últ balanço processado", "30/06/2026"],
  ["P/L", "9,87"], ["P/VP", "2,01"], ["LPA", "3,86"], ["VPA", "18,97"], ["Div. Yield", "7,1%"], ["ROE", "20,4%"], ["ROIC", "-"],
  ["Marg. Líquida", "-"], ["Dív. Brut/ Patrim.", "-"], ["Cres. Rec (5a)", "12,3%"],
].map(([l, v]) => `<tr>${cell(l, v)}</tr>`).join("")}</table>`;
const FII = `<table>${[
  ["Papel", "HGLG11"], ["Cotação", "158,40"], ["Segmento", "Logística"], ["FFO Yield", "8,9%"], ["Div. Yield", "8,6%"], ["P/VP", "0,96"],
  ["VP/Cota", "165,10"], ["Dividendo/cota", "13,62"], ["Qtd imóveis", "21"], ["Vacância Média", "4,2%"], ["Cap Rate", "9,1%"],
].map(([l, v]) => `<tr>${cell(l, v)}</tr>`).join("")}</table>`;

describe("fundamentos B3 (Fundamentus)", () => {
  it("números pt-BR e '-' como ausente", () => {
    expect(brNumber("1.234,56")).toBe(1234.56);
    expect(brNumber("7,1%")).toBe(7.1);
    expect(brNumber("-0,5%")).toBe(-0.5);
    expect(brNumber("-")).toBeNull();
  });

  it("ação: indicadores e data do balanço", () => {
    const f = parseFundamentus("ITUB4", ACAO);
    expect(f).toMatchObject({ kind: "acao", price: 38.12, pl: 9.87, pvp: 2.01, lpa: 3.86, vpa: 18.97, dy: 7.1, roe: 20.4, roic: null, revenueGrowth5y: 12.3, asOf: "2026-06-30" });
  });

  it("FII: P/VP, VP/cota, vacância, imóveis", () => {
    const f = parseFundamentus("HGLG11", FII);
    expect(f).toMatchObject({ kind: "fii", pvp: 0.96, vpa: 165.1, dy: 8.6, vacancy: 4.2, properties: 21, dividendPerShare12m: 13.62, segment: "Logística" });
  });

  it("página vazia/bloqueada → nada inventado", () => {
    const f = parseFundamentus("XXXX3", "<html>Acesso negado</html>");
    expect(f.kind).toBe("desconhecido");
    expect(f.fieldsFound).toBe(0);
  });
});

describe("valuation e qualidade BR", () => {
  it("ação: Graham + Bazin → faixa; qualidade com o que existe", () => {
    const f = parseFundamentus("ITUB4", ACAO);
    const v = brFair(f, 38.12);
    const graham = Math.sqrt(22.5 * 3.86 * 18.97), bazin = (0.071 * 38.12) / 0.06;
    expect(v.methods.map((m) => m.label)).toEqual(["Graham", "Bazin (6%)"]);
    expect(v.fair!.mean).toBeCloseTo((graham + bazin) / 2, 2);
    expect(v.fair!.basis).toBe("graham-bazin");
    const q = brQuality(f);
    expect(q.coverage).toBeCloseTo(2 / 5); // ROE e crescimento
    expect(q.score).toBe(100);
  });

  it("métodos divergentes demais → sem faixa (dados conflitantes)", () => {
    const f = { ...parseFundamentus("PETR4", ACAO), lpa: 0.5, vpa: 5, dy: 18 } as BrFundamentals;
    expect(brFair(f, 38).fair).toBeNull();
    expect(brFair(f, 38).reason).toMatch(/divergem/);
  });

  it("FII: valor justo = VP/cota; qualidade por vacância e diversificação", () => {
    const f = parseFundamentus("HGLG11", FII);
    expect(brFair(f, 158.4).fair).toMatchObject({ mean: 165.1, basis: "patrimonial" });
    expect(brQuality(f)).toMatchObject({ score: 100, coverage: 1 });
  });
});
