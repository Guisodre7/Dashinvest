import type { TransactionRow } from "../db/repo";
import type { PortfolioSummary } from "../portfolio/calc";
import type { AssetAnalysis } from "./analyze";
import { analystSignal } from "./analystSignal";
import { PARAMS } from "./params";
import { computeStance, DEFAULT_TAX, type Stance, type StanceInput, type TaxRules } from "./stance";

export type TaxSettings = typeof DEFAULT_TAX;

export function parseTaxSettings(raw: unknown): TaxSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof TaxSettings, Partial<TaxRules>>>;
  const one = (k: keyof TaxSettings): TaxRules => {
    const d = DEFAULT_TAX[k], v = r[k] ?? {};
    const n = (x: unknown, lo: number, hi: number, def: number) => (typeof x === "number" && Number.isFinite(x) && x >= lo && x <= hi ? x : def);
    return {
      feePerOrder: n(v.feePerOrder, 0, 1000, d.feePerOrder),
      gainTaxRate: n(v.gainTaxRate, 0, 0.5, d.gainTaxRate),
      monthlyExemption: v.monthlyExemption === null ? null : n(v.monthlyExemption, 0, 1e7, d.monthlyExemption ?? 0) || d.monthlyExemption,
      minTicket: n(v.minTicket, 0, 1e6, d.minTicket),
      note: d.note,
    };
  };
  return { US: one("US"), BR_ACAO: one("BR_ACAO"), BR_FII: one("BR_FII") };
}

/** Valor justo para as faixas: fair value multi-fonte; senão, âncora do múltiplo histórico das zonas. */
export function fairFromAnalysis(a: AssetAnalysis): StanceInput["fair"] {
  if (a.fairValue.available && a.fairValue.mean) return { low: a.fairValue.min, mean: a.fairValue.mean, high: a.fairValue.max, basis: "fair-value" };
  const c = a.zones.zones.find((z) => z.zone === "C");
  if (a.zones.basis === "historical-multiple" && c?.low) return { low: null, mean: c.low / 0.95, high: null, basis: "historical-multiple" };
  return null;
}

/** Postura de cada ativo da carteira internacional. */
export function usStances(analyses: AssetAnalysis[], portfolio: PortfolioSummary, transactions: TransactionRow[], tax: TaxSettings, now = new Date()): Stance[] {
  return analyses.map((a) => computeStance(usStanceInput(a, portfolio, transactions, tax, now)));
}

export function usStanceInput(a: AssetAnalysis, portfolio: PortfolioSummary, transactions: TransactionRow[], tax: TaxSettings, now = new Date()): StanceInput {
  const since = new Date(now.getTime() - 548 * 86_400_000).toISOString().slice(0, 10); // ~18 meses
  {
    const p = portfolio.positions.find((x) => x.ticker === a.ticker);
    const sell = transactions
      .filter((t) => t.kind === "sell" && t.ticker === a.ticker && t.trade_date >= since && t.price && t.quantity)
      .sort((x, y) => y.trade_date.localeCompare(x.trade_date))[0];
    return {
      ticker: a.ticker, isEtf: a.isEtf, isLegacy: a.strategy.is_legacy, price: a.price, fair: fairFromAnalysis(a),
      qualityScore: a.quality?.score ?? null, qualityCoverage: a.quality?.coverage ?? 0,
      signalKinds: a.signals.map((s) => s.kind),
      estimates: { direction: a.trend.direction, significantCut: a.trend.significant_cut, epsRev90d: a.trend.eps_rev_90d ?? a.trend.eps_rev_30d },
      priceChange6m: a.momentum?.ret_6m ?? null,
      weight: p ? (a.strategy.is_legacy ? p.weightTotal : p.weightStrategic) : 0,
      target: a.targetWeight, maxWeight: a.strategy.max_weight,
      position: p && p.quantity > 0 ? { quantity: p.quantity, avgCost: p.quantity ? p.costUsd / p.quantity : p.avgPrice, value: p.valueUsd ?? 0 } : null,
      lastSell: sell ? { date: sell.trade_date, price: sell.price!, quantity: sell.quantity! } : null,
      tax: tax.US, currency: "US$",
      ...usConfirmations(a),
    };
  }
}

/** Confirmações do valuation: analistas (sinal e divergência) e DCF reverso. */
export function usConfirmations(a: AssetAnalysis): Pick<StanceInput, "analystScore" | "uncertain" | "impliedGap"> {
  const sig = analystSignal(a.trend, a.analysts);
  const fv = a.fairValue;
  const impliedGap = fv.implied_growth != null && fv.base_growth != null ? fv.implied_growth - fv.base_growth : null;
  // Incerteza alta (spec §22): analistas divergentes, métodos de valor justo divergentes ou base fraca.
  const methodsDiverge = (fv.uncertainty_pct ?? 0) > PARAMS.valuation.maxMethodSpread * 100 / 2;
  return { analystScore: sig.score, uncertain: (sig.dispersion ?? 0) > PARAMS.analysts.highDispersion || methodsDiverge || fairFromAnalysis(a)?.basis === "historical-multiple", impliedGap };
}
