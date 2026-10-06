import type { BrFundamentals } from "../market/parseFundamentus";
import type { StanceInput } from "./stance";

/**
 * Valuation de ativos da B3 a partir dos fundamentos públicos + juros do Banco Central.
 *  - Ações: Graham (√(22,5 × LPA × VPA)); Bazin (dividendos ÷ yield exigido, que sobe com o
 *    juro real: 6%–9%); e lucro × P/L justo pelo juro real (1 ÷ (juro real + 4% de prêmio)).
 *  - FIIs: VP/cota e renda ÷ yield exigido (juro real + 1,5 p.p., 7%–12%).
 * Valor justo = mediana dos métodos; métodos muito divergentes = sem faixa.
 */
export function brFair(f: BrFundamentals, price: number | null, realPct: number | null = null): { fair: StanceInput["fair"]; methods: { label: string; value: number }[]; reason: string | null } {
  const px = price ?? f.price;
  const methods: { label: string; value: number }[] = [];
  const real = realPct !== null && Number.isFinite(realPct) ? realPct / 100 : null;
  if (f.kind === "fii") {
    if (!f.vpa || f.vpa <= 0) return { fair: null, methods: [], reason: "VP/cota indisponível." };
    methods.push({ label: "VP/cota", value: f.vpa });
    const income = f.dividendPerShare12m ?? (f.dy && px ? (f.dy / 100) * px : null);
    if (income && income > 0 && real !== null) {
      const req = clamp(real + 0.015, 0.07, 0.12);
      methods.push({ label: `Renda ÷ ${(req * 100).toFixed(1)}%`, value: income / req });
    }
    return pick(methods, "patrimonial", 1);
  }
  if (f.lpa && f.vpa && f.lpa > 0 && f.vpa > 0) methods.push({ label: "Graham", value: Math.sqrt(22.5 * f.lpa * f.vpa) });
  const req = real !== null ? clamp(real, 0.06, 0.09) : 0.06;
  if (f.dy && f.dy > 0 && px) methods.push({ label: `Bazin (${(req * 100).toFixed(1).replace(".0", "")}%)`, value: (f.dy / 100 * px) / req });
  if (f.lpa && f.lpa > 0 && real !== null) {
    const pe = 1 / (Math.max(real, 0.02) + 0.04);
    methods.push({ label: `Lucro × P/L ${pe.toFixed(1)} (juro real)`, value: f.lpa * pe });
  }
  if (methods.length < 2) return { fair: null, methods, reason: "Menos de 2 métodos disponíveis (lucro ou dividendos ausentes)." };
  return pick(methods, "graham-bazin", 2);
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function pick(methods: { label: string; value: number }[], basis: "graham-bazin" | "patrimonial", min: number) {
  const sorted = methods.map((m) => m.value).sort((a, b) => a - b);
  const mean = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  // Com 3 métodos, o mais distante da mediana não entra na checagem de divergência.
  const kept = sorted.length >= 3 ? [...sorted].sort((a, b) => Math.abs(b - mean) - Math.abs(a - mean)).slice(1) : sorted;
  const low = Math.min(...kept), high = Math.max(...kept);
  if (kept.length >= min && kept.length > 1 && (high - low) / mean > 0.8) return { fair: null, methods, reason: "Os métodos divergem mais de 80% — dados conflitantes, faixa não exibida." };
  return { fair: { low, mean, high, basis }, methods, reason: null };
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
