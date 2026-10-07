import type { BrFundamentals } from "../market/parseFundamentus";
import { PARAMS } from "./params";
import { robustRange } from "./robust";
import type { StanceInput } from "./stance";

/**
 * Valuation de ativos da B3 a partir dos fundamentos públicos + juros do Banco Central.
 * Métodos de perpetuidade usam o juro real de LONGO PRAZO: média entre o juro real atual
 * e o juro neutro estimado pelo BC — a Selic de pico não dura 10 anos.
 *  - Ações: Graham; Bazin (dividendos ÷ yield exigido); lucro × P/L justo pelo juro real;
 *    e P/VP justificado pelo ROE ((ROE − g) ÷ (custo de capital − g)), o modelo adequado a
 *    bancos (spec §9), que também reconhece empresas que crescem com retorno alto.
 *  - FIIs: VP/cota e renda ÷ yield exigido.
 * Valor justo = mediana robusta dos métodos; métodos sem consenso = sem faixa.
 * Parâmetros em PARAMS.brazil (spec §23).
 */
export const NEUTRAL_REAL_RATE = PARAMS.brazil.neutralRealRate;

/** Bancos, seguradoras e financeiras (setor do Fundamentus): modelo setorial próprio (spec §9). */
export const isBrFinancial = (f: Pick<BrFundamentals, "sector">) => !!f.sector && /financ|banc|segur|previd/i.test(f.sector);

/**
 * Commodities (petróleo, mineração, siderurgia, papel e celulose): lucro e dividendo oscilam com o
 * ciclo — dividendo passado não sustenta valor (teses-base: PETR4/VALE3). Sem Bazin e com
 * margem de segurança maior na faixa de compra.
 */
export const isBrCommodity = (f: Pick<BrFundamentals, "sector">) => !!f.sector && /petr[óo]leo|g[áa]s|minera|siderur|metalur|papel e celulose/i.test(f.sector);

/** FII de papel/crédito × tijolo: modelos diferentes (spec §11). */
export const fiiKind = (f: Pick<BrFundamentals, "segment">): "papel" | "tijolo" | "indefinido" =>
  !f.segment ? "indefinido" : /papel|receb|t[ií]tulos|cr[eé]dito|\bcri\b|h[ií]brido/i.test(f.segment) ? "papel" : "tijolo";

export function brFair(f: BrFundamentals, price: number | null, realPct: number | null = null, ipcaPct: number | null = null): { fair: StanceInput["fair"]; methods: { label: string; value: number }[]; reason: string | null } {
  const B = PARAMS.brazil;
  const px = price ?? f.price;
  const methods: { label: string; value: number }[] = [];
  const real = realPct !== null && Number.isFinite(realPct) ? (realPct + NEUTRAL_REAL_RATE) / 2 / 100 : null;
  if (f.kind === "fii") {
    if (!f.vpa || f.vpa <= 0) return { fair: null, methods: [], reason: "VP/cota indisponível." };
    methods.push({ label: "VP/cota", value: f.vpa });
    const income = f.dividendPerShare12m ?? (f.dy && px ? (f.dy / 100) * px : null);
    if (income && income > 0 && real !== null) {
      const req = clamp(real + B.fiiSpread, B.fiiYield[0], B.fiiYield[1]);
      methods.push({ label: `Renda ÷ ${(req * 100).toFixed(1)}%`, value: income / req });
    }
    return pick(methods, "patrimonial");
  }
  if (f.lpa && f.vpa && f.lpa > 0 && f.vpa > 0) methods.push({ label: "Graham", value: Math.sqrt(22.5 * f.lpa * f.vpa) });
  const req = real !== null ? clamp(real, B.bazinYield[0], B.bazinYield[1]) : B.bazinYield[0];
  if (f.dy && f.dy > 0 && px && !isBrCommodity(f)) methods.push({ label: `Bazin (${(req * 100).toFixed(1).replace(".0", "")}%)`, value: (f.dy / 100 * px) / req });
  if (f.lpa && f.lpa > 0 && real !== null) {
    const pe = 1 / (Math.max(real, 0.02) + B.equityPremium);
    methods.push({ label: `Lucro × P/L ${pe.toFixed(1)} (juro real)`, value: f.lpa * pe });
  }
  // P/VP justificado pelo ROE (tudo nominal): custo de capital = juro real longo + prêmio + IPCA.
  // ROE pelo próprio LPA ÷ VPA (consistente com os outros métodos); senão, o publicado.
  const roePct = f.lpa && f.vpa && f.vpa > 0 ? (f.lpa / f.vpa) * 100 : f.roe;
  if (roePct && f.vpa && f.vpa > 0 && real !== null && ipcaPct !== null) {
    const roe = roePct / 100, ipca = ipcaPct / 100, ke = real + B.equityPremium + ipca;
    const payout = f.dy && f.pl && f.pl > 0 ? clamp((f.dy * f.pl) / 100, 0, 1) : 0.5;
    const g = Math.min(roe * (1 - payout), ipca + 0.03);
    if (roe > g && ke - g > 0.01) methods.push({ label: "P/VP justificado pelo ROE", value: f.vpa * (roe - g) / (ke - g) });
  }
  if (methods.length < 2) return { fair: null, methods, reason: "Menos de 2 métodos disponíveis (lucro ou dividendos ausentes)." };
  return pick(methods, "graham-bazin");
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Confiança da análise de um ativo da B3 (spec §22): baixa sem faixa ou com métodos
 * muito divergentes; alta só com métodos próximos e qualidade conhecida.
 */
export function brConfidence(v: { fair: { low: number | null; high: number | null } | null; fundamentals?: unknown; stance: { quality: string } }): "Alta" | "Média" | "Baixa" {
  if (!v.fair || v.fair.low === null || v.fair.high === null || v.fair.low <= 0) return "Baixa";
  const ratio = v.fair.high / v.fair.low;
  if (ratio > 1.5) return "Baixa";
  return ratio < 1.2 && v.stance.quality !== "sem dados" ? "Alta" : "Média";
}

function pick(methods: { label: string; value: number }[], basis: "graham-bazin" | "patrimonial") {
  const rr = robustRange(methods.map((m) => m.value));
  if (rr.spread > PARAMS.valuation.maxMethodSpread) return { fair: null, methods, reason: "Os métodos divergem demais — dados conflitantes, faixa não exibida." };
  return { fair: { low: rr.low, mean: rr.mid, high: rr.high, basis }, methods, reason: null };
}

/**
 * Qualidade 0–100 (com cobertura) a partir dos indicadores disponíveis, por modelo setorial:
 *  - empresas não financeiras: ROE, ROIC, margem líquida, dívida/patrimônio, crescimento;
 *  - bancos/seguradoras (spec §9): ROE e crescimento — sem dívida/patrimônio nem ROIC;
 *  - FII de tijolo (spec §11): vacância e diversificação de imóveis;
 *  - FII de papel: a qualidade está nos CRIs (LTV, rating, inadimplência), que a fonte gratuita
 *    não traz — fica "sem dados" em vez de aplicar o modelo de tijolo.
 */
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
    if (fiiKind(f) === "papel") {
      notes.push("FII de crédito: qualidade dos CRIs (LTV, rating, inadimplência) não está na fonte gratuita — confira o relatório gerencial");
      return { score: null, coverage: 0, notes };
    }
    total = 2;
    grade("Vacância", f.vacancy, 5, 12, false);
    grade("Qtd. imóveis", f.properties, 15, 5);
  } else if (isBrFinancial(f)) {
    total = 2;
    grade("ROE", f.roe, 15, 10);
    grade("Crescimento receita 5a", f.revenueGrowth5y, 10, 4);
    notes.push("banco/seguradora: CET1, inadimplência e cobertura não estão na fonte gratuita");
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
