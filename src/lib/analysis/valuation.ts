import type { AnalystData, Fundamentals } from "../market/types";
import type { EstimateTrend } from "./estimates";

export interface ValuationView {
  pe: number | null;
  forward_pe: number | null;
  peg: number | null;
  ps: number | null;
  pfcf: number | null;
  ev_ebitda: number | null;
  fcf_yield: number | null;
  dividend_yield: number | null;
  /** P/L atual vs média de 5 anos da própria empresa (%). Negativo = abaixo da média. */
  pe_vs_5y: number | null;
  ps_vs_5y: number | null;
  /** Forward P/E dividido pelo crescimento esperado de EPS. */
  growth_adjusted_pe: number | null;
  /** -1 (esticado) .. +1 (atrativo), considerando crescimento. null se dados insuficientes. */
  score: number | null;
  notes: string[];
}

const clamp = (v: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));

/**
 * Nunca conclui "P/L baixo = barato". O score combina:
 *  - múltiplo atual vs histórico da própria empresa;
 *  - múltiplo ajustado pelo crescimento esperado (PEG / forward PE ÷ crescimento);
 *  - FCF yield.
 */
export function valuationView(f: Fundamentals | null, trend: EstimateTrend | null): ValuationView {
  const v: ValuationView = {
    pe: f?.pe ?? null, forward_pe: f?.forward_pe ?? null, peg: f?.peg ?? null, ps: f?.ps ?? null,
    pfcf: f?.pfcf ?? null, ev_ebitda: f?.ev_ebitda ?? null, fcf_yield: f?.fcf_yield ?? null,
    dividend_yield: f?.dividend_yield ?? null,
    pe_vs_5y: null, ps_vs_5y: null, growth_adjusted_pe: null, score: null, notes: [],
  };
  if (!f) return v;
  if (f.pe && f.pe > 0 && f.pe_5y_avg) v.pe_vs_5y = ((f.pe - f.pe_5y_avg) / f.pe_5y_avg) * 100;
  if (f.ps && f.ps_5y_avg) v.ps_vs_5y = ((f.ps - f.ps_5y_avg) / f.ps_5y_avg) * 100;

  const growth = trend?.expected_eps_growth ?? f.eps_growth_3y ?? null;
  if (f.forward_pe && f.forward_pe > 0 && growth && growth > 0) v.growth_adjusted_pe = f.forward_pe / growth;

  const parts: { s: number; w: number }[] = [];
  if (v.pe_vs_5y !== null) {
    parts.push({ s: clamp(-v.pe_vs_5y / 30), w: 0.35 });
    v.notes.push(`P/L ${v.pe_vs_5y >= 0 ? "acima" : "abaixo"} da média de 5 anos em ${Math.abs(v.pe_vs_5y).toFixed(0)}%.`);
  } else if (v.ps_vs_5y !== null) {
    parts.push({ s: clamp(-v.ps_vs_5y / 30), w: 0.25 });
  }
  const peg = v.growth_adjusted_pe ?? (f.peg && f.peg > 0 ? f.peg : null);
  if (peg !== null) {
    // PEG ~1 neutro-positivo, 2+ esticado, <0.8 atrativo.
    parts.push({ s: clamp((1.5 - peg) / 1), w: 0.4 });
    v.notes.push(`Múltiplo ajustado ao crescimento (PEG) de ${peg.toFixed(2)}.`);
  }
  if (f.fcf_yield !== null && f.fcf_yield > 0) {
    parts.push({ s: clamp((f.fcf_yield - 3) / 3), w: 0.25 });
  }
  if (parts.length) {
    const w = parts.reduce((a, p) => a + p.w, 0);
    v.score = parts.reduce((a, p) => a + p.s * p.w, 0) / w;
  }
  if (f.pe && f.pe < 12 && (growth ?? 0) < 0) v.notes.push("P/L baixo acompanhado de expectativa de queda de lucro — pode não indicar desconto.");
  if (f.pe && f.pe > 40 && (growth ?? 0) > 30) v.notes.push("P/L elevado, mas com crescimento esperado alto — interpretar em conjunto.");
  return v;
}

export interface FairValueEstimate {
  method: string;
  value: number;
  source: string;
}

export interface FairValueView {
  estimates: FairValueEstimate[];
  min: number | null;
  mean: number | null;
  max: number | null;
  /** (preço - fair value médio) / fair value médio. Negativo = desconto. */
  discount_pct: number | null;
  /** Largura da faixa de incerteza em % do médio. */
  uncertainty_pct: number | null;
  available: boolean;
  reason: string | null;
}

/**
 * Faixa de fair value a partir de múltiplos métodos independentes.
 * Exige pelo menos 2 estimativas — uma única estimativa não é exibida como fair value.
 */
export function fairValueView(
  price: number | null,
  f: Fundamentals | null,
  trend: EstimateTrend | null,
  analysts: AnalystData | null,
  isEtf: boolean,
): FairValueView {
  const empty = (reason: string): FairValueView => ({
    estimates: [], min: null, mean: null, max: null, discount_pct: null, uncertainty_pct: null, available: false, reason,
  });
  if (isEtf) return empty("Fair value não se aplica a ETFs — avalie yield, duration e composição.");
  const est: FairValueEstimate[] = [];

  // 1) EPS futuro × P/L médio histórico da própria empresa.
  const fwdEps = trend?.eps_current ?? (price && f?.forward_pe ? price / f.forward_pe : null);
  if (fwdEps && fwdEps > 0 && f?.pe_5y_avg) {
    est.push({ method: "EPS projetado × P/L médio 5 anos", value: fwdEps * f.pe_5y_avg, source: `${f.meta.source} (múltiplos) + estimativas` });
  }
  // 2) Preço-alvo médio de analistas (horizonte 12 meses — não é fair value intrínseco).
  if (analysts?.target_mean) {
    est.push({ method: "Preço-alvo médio de analistas (12m)", value: analysts.target_mean, source: analysts.meta.source });
  }
  // 3) EPS dos últimos 12 meses × P/L médio 5 anos (base realizada, não projetada).
  if (f?.eps_ttm && f.eps_ttm > 0 && f.pe_5y_avg) {
    est.push({ method: "EPS 12m × P/L médio 5 anos", value: f.eps_ttm * f.pe_5y_avg, source: f.meta.source });
  }

  if (est.length < 2) {
    return { ...empty(est.length === 1 ? "Fair value indisponível — apenas uma estimativa encontrada (mínimo 2)." : "Fair value indisponível."), estimates: est };
  }
  const vals = est.map((e) => e.value);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const min = Math.min(...vals), max = Math.max(...vals);
  const spread = ((max - min) / mean) * 100;
  if (spread > 80) {
    return { ...empty("Os dados disponíveis são conflitantes — estimativas de fair value divergem mais de 80%."), estimates: est, min, mean, max, uncertainty_pct: spread };
  }
  return {
    estimates: est, min, mean, max,
    discount_pct: price ? ((price - mean) / mean) * 100 : null,
    uncertainty_pct: spread,
    available: true,
    reason: null,
  };
}

export interface QualityMetric {
  key: string;
  label: string;
  value: number | null;
  unit: "%" | "x";
  assessment: "forte" | "adequado" | "fraco" | "sem dado";
}

export interface BusinessQuality {
  metrics: QualityMetric[];
  score: number | null; // 0..100
  coverage: number; // 0..1
}

/** Qualidade do negócio — análise separada; não vira recomendação automática. */
export function businessQuality(f: Fundamentals | null): BusinessQuality {
  const m = (key: string, label: string, value: number | null, unit: "%" | "x", good: number, ok: number, higherIsBetter = true): QualityMetric => {
    let assessment: QualityMetric["assessment"] = "sem dado";
    if (value !== null) {
      const v = higherIsBetter ? value : -value;
      const g = higherIsBetter ? good : -good, o = higherIsBetter ? ok : -ok;
      assessment = v >= g ? "forte" : v >= o ? "adequado" : "fraco";
    }
    return { key, label, value, unit, assessment };
  };
  const metrics: QualityMetric[] = [
    m("revenue_growth", "Crescimento de receita (a/a)", f?.revenue_growth_yoy ?? null, "%", 15, 5),
    m("eps_growth", "Crescimento de EPS (a/a)", f?.eps_growth_yoy ?? null, "%", 15, 5),
    m("revenue_growth_3y", "Crescimento de receita (3 anos, a.a.)", f?.revenue_growth_3y ?? null, "%", 12, 5),
    m("operating_margin", "Margem operacional", f?.operating_margin ?? null, "%", 25, 12),
    m("net_margin", "Margem líquida", f?.net_margin ?? null, "%", 20, 8),
    m("roic", "ROIC", f?.roic ?? null, "%", 15, 8),
    m("roe", "ROE", f?.roe ?? null, "%", 20, 10),
    m("fcf_growth", "Crescimento do FCF (5 anos)", f?.fcf_growth ?? null, "%", 12, 3),
    m("fcf_yield", "FCF yield", f?.fcf_yield ?? null, "%", 4, 2),
    m("debt_to_equity", "Dívida / patrimônio", f?.debt_to_equity ?? null, "x", 0.5, 1.5, false),
    m("current_ratio", "Liquidez corrente", f?.current_ratio ?? null, "x", 1.5, 1),
    m("shares_change", "Variação de ações em circulação (a/a)", f?.shares_change_yoy ?? null, "%", -1, 1, false),
  ];
  const scored = metrics.filter((x) => x.assessment !== "sem dado");
  const pts = { forte: 100, adequado: 60, fraco: 20, "sem dado": 0 } as const;
  return {
    metrics,
    score: scored.length >= 4 ? scored.reduce((a, x) => a + pts[x.assessment], 0) / scored.length : null,
    coverage: scored.length / metrics.length,
  };
}
