import type { StrategyRow } from "../analysis/analyze";

export interface PositionRow {
  id?: string;
  ticker: string;
  quantity: number;
  avg_price: number;
  avg_fx_rate: number | null;
  purchase_date: string | null;
  broker: string | null;
  fees: number;
  currency: string;
}

export interface DividendRow {
  ticker: string;
  kind: "dividend" | "distribution";
  gross_amount: number;
  withholding_tax: number;
  net_amount?: number;
  pay_date: string | null;
  ex_date: string | null;
  reinvested: boolean;
}

export interface PositionView {
  ticker: string;
  quantity: number;
  avgPrice: number;
  price: number | null;
  costUsd: number;
  valueUsd: number | null;
  pnlUsd: number | null;
  /** Retorno do ativo em USD (%). */
  assetReturn: number | null;
  dividendsUsd: number;
  /** Retorno total em USD incluindo proventos líquidos (%). */
  totalReturnUsd: number | null;
  costBrl: number | null;
  valueBrl: number | null;
  /** Retorno cambial (%): variação do dólar desde o câmbio médio de compra. */
  fxReturn: number | null;
  /** Retorno total em BRL (%). */
  totalReturnBrl: number | null;
  /** Peso na carteira estratégica (exclui legado) e na carteira total. */
  weightStrategic: number | null;
  weightTotal: number | null;
  targetWeight: number;
  gap: number | null;
  isLegacy: boolean;
  legacyLabel: string | null;
  bucket: string;
}

export interface PortfolioSummary {
  totalUsd: number;
  totalBrl: number | null;
  costUsd: number;
  costBrl: number | null;
  strategicUsd: number;
  legacyUsd: number;
  pnlUsd: number;
  assetReturn: number | null;
  fxReturn: number | null;
  totalReturnBrl: number | null;
  dividendsUsd: number;
  positions: PositionView[];
  missingPrices: string[];
  usdBrl: number | null;
}

/**
 * Carteira real: valores, P/L, pesos e decomposição do retorno em BRL:
 *   (1 + retorno BRL) = (1 + retorno do ativo em USD) × (1 + retorno cambial)
 * Pesos são calculados sobre a carteira ESTRATÉGICA (sem posições legadas)
 * para comparação com os pesos-alvo; o peso sobre o total também é exibido.
 */
export function computePortfolio(
  positions: PositionRow[],
  prices: Record<string, number | null>,
  strategy: StrategyRow[],
  dividends: DividendRow[],
  usdBrl: number | null,
): PortfolioSummary {
  const strat = new Map(strategy.map((s) => [s.ticker, s]));
  const targetSum = strategy.filter((s) => s.enabled && !s.is_legacy).reduce((a, s) => a + s.target_weight, 0) || 100;
  const divBy = new Map<string, number>();
  for (const d of dividends) divBy.set(d.ticker, (divBy.get(d.ticker) ?? 0) + (d.net_amount ?? d.gross_amount - d.withholding_tax));

  const missing: string[] = [];
  const rows = positions.filter((p) => p.quantity > 0).map((p) => {
    const price = prices[p.ticker] ?? null;
    if (price === null) missing.push(p.ticker);
    const s = strat.get(p.ticker);
    const cost = p.quantity * p.avg_price + (p.fees ?? 0);
    const value = price !== null ? p.quantity * price : null;
    return { p, s, price, cost, value };
  });

  const strategicUsd = rows.filter((r) => !r.s?.is_legacy).reduce((a, r) => a + (r.value ?? 0), 0);
  const legacyUsd = rows.filter((r) => r.s?.is_legacy).reduce((a, r) => a + (r.value ?? 0), 0);
  const totalUsd = strategicUsd + legacyUsd;

  const views: PositionView[] = rows.map(({ p, s, price, cost, value }) => {
    const div = divBy.get(p.ticker) ?? 0;
    const assetReturn = value !== null && cost > 0 ? (value / cost - 1) * 100 : null;
    const totalReturnUsd = value !== null && cost > 0 ? ((value + div) / cost - 1) * 100 : null;
    const costBrl = p.avg_fx_rate ? cost * p.avg_fx_rate : null;
    const valueBrl = value !== null && usdBrl ? value * usdBrl : null;
    const fxReturn = p.avg_fx_rate && usdBrl ? (usdBrl / p.avg_fx_rate - 1) * 100 : null;
    const totalReturnBrl = costBrl && valueBrl !== null ? ((valueBrl + div * (usdBrl ?? 0)) / costBrl - 1) * 100 : null;
    const isLegacy = !!s?.is_legacy;
    const tw = s && !isLegacy && s.enabled ? (s.target_weight / targetSum) * 100 : 0;
    const wS = !isLegacy && value !== null && strategicUsd > 0 ? (value / strategicUsd) * 100 : null;
    return {
      ticker: p.ticker, quantity: p.quantity, avgPrice: p.avg_price, price, costUsd: cost, valueUsd: value,
      pnlUsd: value !== null ? value - cost : null, assetReturn, dividendsUsd: div, totalReturnUsd,
      costBrl, valueBrl, fxReturn, totalReturnBrl,
      weightStrategic: wS, weightTotal: value !== null && totalUsd > 0 ? (value / totalUsd) * 100 : null,
      targetWeight: tw, gap: wS !== null ? tw - wS : null,
      isLegacy, legacyLabel: s?.legacy_label ?? null, bucket: s?.strategy_bucket ?? "—",
    };
  });

  // Ativos da estratégia sem posição aparecem com peso 0.
  for (const s of strategy) {
    if (!s.enabled || s.is_legacy || views.some((v) => v.ticker === s.ticker)) continue;
    const tw = (s.target_weight / targetSum) * 100;
    views.push({
      ticker: s.ticker, quantity: 0, avgPrice: 0, price: prices[s.ticker] ?? null, costUsd: 0, valueUsd: 0, pnlUsd: 0,
      assetReturn: null, dividendsUsd: divBy.get(s.ticker) ?? 0, totalReturnUsd: null, costBrl: null, valueBrl: 0,
      fxReturn: null, totalReturnBrl: null, weightStrategic: 0, weightTotal: 0, targetWeight: tw, gap: tw,
      isLegacy: false, legacyLabel: null, bucket: s.strategy_bucket,
    });
  }

  const costUsd = views.reduce((a, v) => a + v.costUsd, 0);
  const pricedCost = views.filter((v) => v.valueUsd !== null).reduce((a, v) => a + v.costUsd, 0);
  const costBrlAll = views.every((v) => v.quantity === 0 || v.costBrl !== null)
    ? views.reduce((a, v) => a + (v.costBrl ?? 0), 0)
    : null;
  const totalBrl = usdBrl ? totalUsd * usdBrl : null;
  const dividendsUsd = views.reduce((a, v) => a + v.dividendsUsd, 0);
  const assetReturn = pricedCost > 0 ? (totalUsd / pricedCost - 1) * 100 : null;
  const totalReturnBrl = costBrlAll && totalBrl !== null ? (totalBrl / costBrlAll - 1) * 100 : null;
  const fxReturn = assetReturn !== null && totalReturnBrl !== null ? ((1 + totalReturnBrl / 100) / (1 + assetReturn / 100) - 1) * 100 : null;

  const order = (v: PositionView) => (v.isLegacy ? 1 : 0);
  views.sort((a, b) => order(a) - order(b) || (b.valueUsd ?? 0) - (a.valueUsd ?? 0));

  return {
    totalUsd, totalBrl, costUsd, costBrl: costBrlAll, strategicUsd, legacyUsd,
    pnlUsd: totalUsd - pricedCost, assetReturn, fxReturn, totalReturnBrl, dividendsUsd,
    positions: views, missingPrices: missing, usdBrl,
  };
}
