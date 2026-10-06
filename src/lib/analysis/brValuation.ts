import type { BrFundamentals } from "../market/parseFundamentus";
import type { StanceInput } from "./stance";

/**
 * Valuation e qualidade de ativos da B3 a partir dos fundamentos públicos.
 *  - Ações: Graham (√(22,5 × LPA × VPA)) e Bazin (dividendos 12m ÷ 6%). Exige os
 *    dois métodos; se divergirem mais de 80%, não exibe faixa (dados conflitantes).
 *  - FIIs: valor patrimonial por cota (P/VP = 1), padrão de mercado para fundos.
 * São métodos simples e conhecidos — estimativas, não preço verdadeiro.
 */
export function brFair(f: BrFundamentals, price: number | null): { fair: StanceInput["fair"]; methods: { label: string; value: number }[]; reason: string | null } {
  if (f.kind === "fii") {
    if (!f.vpa || f.vpa <= 0) return { fair: null, methods: [], reason: "VP/cota indisponível." };
    return { fair: { low: f.vpa * 0.95, mean: f.vpa, high: f.vpa * 1.05, basis: "patrimonial" }, methods: [{ label: "VP/cota", value: f.vpa }], reason: null };
  }
  const methods: { label: string; value: number }[] = [];
  if (f.lpa && f.vpa && f.lpa > 0 && f.vpa > 0) methods.push({ label: "Graham", value: Math.sqrt(22.5 * f.lpa * f.vpa) });
  const px = price ?? f.price;
  if (f.dy && f.dy > 0 && px) methods.push({ label: "Bazin (6%)", value: (f.dy / 100 * px) / 0.06 });
  if (methods.length < 2) return { fair: null, methods, reason: "Menos de 2 métodos disponíveis (lucro ou dividendos ausentes)." };
  const vals = methods.map((m) => m.value);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const low = Math.min(...vals), high = Math.max(...vals);
  if ((high - low) / mean > 0.8) return { fair: null, methods, reason: "Os métodos divergem mais de 80% — dados conflitantes, faixa não exibida." };
  return { fair: { low, mean, high, basis: "graham-bazin" }, methods, reason: null };
}

/** Qualidade 0–100 (com cobertura) a partir dos indicadores disponíveis. */
export function brQuality(f: BrFundamentals): { score: number | null; coverage: number; notes: string[] } {
  const pts: number[] = [];
  const notes: string[] = [];
  const grade = (label: string, v: number | null, good: number, ok: number, higherIsBetter = true) => {
    if (v === null) return;
    const g = higherIsBetter ? v >= good : v <= good;
    const o = higherIsBetter ? v >= ok : v <= ok;
    pts.push(g ? 100 : o ? 60 : 20);
    notes.push(`${label} ${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}${label.includes("imóveis") ? "" : label.includes("Dív") ? "x" : "%"} (${g ? "bom" : o ? "ok" : "fraco"})`);
  };
  let total: number;
  if (f.kind === "fii") {
    total = 2;
    grade("Vacância", f.vacancy, 5, 12, false);
    grade("Qtd. imóveis", f.properties, 15, 5);
  } else {
    total = 5;
    grade("ROE", f.roe, 15, 10);
    grade("ROIC", f.roic, 12, 7);
    grade("Margem líquida", f.netMargin, 15, 8);
    grade("Dív. bruta/patrimônio", f.grossDebtToEquity, 0.5, 1.5, false);
    grade("Crescimento receita 5a", f.revenueGrowth5y, 10, 4);
  }
  return { score: pts.length ? Math.round(pts.reduce((a, b) => a + b, 0) / pts.length) : null, coverage: pts.length / total, notes };
}
