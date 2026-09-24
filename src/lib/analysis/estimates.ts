import type { AnalystData, EarningsEstimates, EstimatePeriod } from "../market/types";

export interface StoredEstimate {
  period: string;
  as_of: string; // YYYY-MM-DD
  eps_avg: number | null;
  revenue_avg: number | null;
}

export type EstimateDirection = "rising" | "stable" | "falling" | "unknown";

export interface EstimateTrend {
  period: string | null;
  eps_current: number | null;
  eps_rev_30d: number | null;
  eps_rev_90d: number | null;
  revenue_rev_30d: number | null;
  revenue_rev_90d: number | null;
  direction: EstimateDirection;
  /** Queda relevante (>= 5% em 90d ou >= 3% em 30d). */
  significant_cut: boolean;
  basis: "provider" | "stored-history" | "none";
  /** Crescimento de EPS esperado: próximo ano fiscal vs corrente (%). */
  expected_eps_growth: number | null;
  expected_revenue_growth: number | null;
  last_surprise_pct: number | null;
  avg_surprise_pct: number | null;
}

const pct = (a: number, b: number) => ((a - b) / Math.abs(b)) * 100;

function pickPrimary(periods: EstimatePeriod[]): EstimatePeriod | null {
  return periods.find((p) => p.period === "+1y") ?? periods.find((p) => p.period === "0y") ?? periods[0] ?? null;
}

function historicalValue(history: StoredEstimate[], period: string, daysAgo: number, key: "eps_avg" | "revenue_avg"): number | null {
  const cutoff = new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
  const rows = history
    .filter((h) => h.period === period && h.as_of <= cutoff && h[key] !== null)
    .sort((a, b) => b.as_of.localeCompare(a.as_of));
  // Exige que o registro não seja muito mais antigo que a janela (tolerância de 20 dias).
  const row = rows[0];
  if (!row) return null;
  const age = (Date.now() - new Date(row.as_of).getTime()) / 86_400_000;
  return age <= daysAgo + 20 ? row[key] : null;
}

export function estimateTrend(est: EarningsEstimates | null, history: StoredEstimate[] = []): EstimateTrend {
  const empty: EstimateTrend = {
    period: null, eps_current: null, eps_rev_30d: null, eps_rev_90d: null,
    revenue_rev_30d: null, revenue_rev_90d: null, direction: "unknown", significant_cut: false,
    basis: "none", expected_eps_growth: null, expected_revenue_growth: null,
    last_surprise_pct: null, avg_surprise_pct: null,
  };
  if (!est) return empty;
  const primary = pickPrimary(est.periods);
  const out: EstimateTrend = { ...empty };

  const surprises = est.surprises.map((s) => s.surprise_pct).filter((v): v is number => v !== null);
  out.last_surprise_pct = surprises[0] ?? null;
  out.avg_surprise_pct = surprises.length ? surprises.slice(0, 4).reduce((a, b) => a + b, 0) / Math.min(4, surprises.length) : null;

  const cy = est.periods.find((p) => p.period === "0y"), ny = est.periods.find((p) => p.period === "+1y");
  if (cy?.eps_avg && ny?.eps_avg && cy.eps_avg > 0) out.expected_eps_growth = pct(ny.eps_avg, cy.eps_avg);
  if (cy?.revenue_avg && ny?.revenue_avg) out.expected_revenue_growth = pct(ny.revenue_avg, cy.revenue_avg);

  if (!primary) return out;
  out.period = primary.period;
  out.eps_current = primary.eps_avg;

  if (primary.eps_revision_30d_pct !== null || primary.eps_revision_90d_pct !== null) {
    out.eps_rev_30d = primary.eps_revision_30d_pct;
    out.eps_rev_90d = primary.eps_revision_90d_pct;
    out.basis = "provider";
  }
  if (primary.eps_avg !== null) {
    const h30 = historicalValue(history, primary.period, 30, "eps_avg");
    const h90 = historicalValue(history, primary.period, 90, "eps_avg");
    if (out.eps_rev_30d === null && h30) { out.eps_rev_30d = pct(primary.eps_avg, h30); out.basis = "stored-history"; }
    if (out.eps_rev_90d === null && h90) { out.eps_rev_90d = pct(primary.eps_avg, h90); out.basis = out.basis === "none" ? "stored-history" : out.basis; }
  }
  if (primary.revenue_avg !== null) {
    const r30 = historicalValue(history, primary.period, 30, "revenue_avg");
    const r90 = historicalValue(history, primary.period, 90, "revenue_avg");
    if (r30) out.revenue_rev_30d = pct(primary.revenue_avg, r30);
    if (r90) out.revenue_rev_90d = pct(primary.revenue_avg, r90);
  }

  const r30 = out.eps_rev_30d, r90 = out.eps_rev_90d;
  if (r30 === null && r90 === null) {
    out.direction = "unknown";
  } else if ((r30 ?? 0) <= -1 || (r90 ?? 0) <= -2) {
    out.direction = "falling";
  } else if ((r30 ?? 0) >= 1 || (r90 ?? 0) >= 2) {
    out.direction = "rising";
  } else {
    out.direction = "stable";
  }
  out.significant_cut = (r90 !== null && r90 <= -5) || (r30 !== null && r30 <= -3);
  return out;
}

export interface ConsensusView {
  total: number;
  buy: number;
  hold: number;
  sell: number;
  /** -1 (todos sell) .. +1 (todos buy) */
  score: number | null;
  /** Mudança do score em relação ao mês anterior e a 3 meses. */
  change_1m: number | null;
  change_3m: number | null;
  target_upside: number | null; // % vs preço
  target_dispersion: number | null; // (high-low)/mean %
}

export function consensusView(a: AnalystData | null, price: number | null): ConsensusView | null {
  if (!a || !a.recommendations.length) {
    if (!a) return null;
  }
  const sc = (r: AnalystData["recommendations"][number] | undefined) => {
    if (!r) return null;
    const buy = r.strong_buy + r.buy, sell = r.sell + r.strong_sell, total = buy + r.hold + sell;
    return total ? (buy - sell) / total : null;
  };
  const cur = a.recommendations[0];
  const buy = cur ? cur.strong_buy + cur.buy : 0;
  const sell = cur ? cur.sell + cur.strong_sell : 0;
  const hold = cur?.hold ?? 0;
  const s0 = sc(cur), s1 = sc(a.recommendations[1]), s3 = sc(a.recommendations[3]);
  return {
    total: buy + hold + sell,
    buy, hold, sell,
    score: s0,
    change_1m: s0 !== null && s1 !== null ? s0 - s1 : null,
    change_3m: s0 !== null && s3 !== null ? s0 - s3 : null,
    target_upside: a.target_mean && price ? pct(a.target_mean, price) : null,
    target_dispersion: a.target_mean && a.target_high !== null && a.target_low !== null
      ? ((a.target_high - a.target_low) / a.target_mean) * 100
      : null,
  };
}
