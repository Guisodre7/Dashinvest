import type { StrategyRow } from "../analysis/analyze";

/** Estratégia inicial — usada apenas como seed (banco) e no modo local. Editável no painel. */
export const DEFAULT_STRATEGY: StrategyRow[] = [
  ...["META", "NVDA", "MSFT", "AAPL", "GOOGL", "BRK.B"].map((ticker) => ({
    ticker, target_weight: 50 / 6, min_weight: 5, max_weight: 12, enabled: true,
    accepts_contributions: true, is_legacy: false, legacy_label: null, priority: 1, strategy_bucket: "CRESCIMENTO",
  })),
  { ticker: "JEPQ", target_weight: 20, min_weight: 15, max_weight: 25, enabled: true, accepts_contributions: true, is_legacy: false, legacy_label: null, priority: 2, strategy_bucket: "RENDA VIA OPÇÕES" },
  { ticker: "LQD", target_weight: 20, min_weight: 15, max_weight: 25, enabled: true, accepts_contributions: true, is_legacy: false, legacy_label: null, priority: 2, strategy_bucket: "CRÉDITO CORPORATIVO" },
  { ticker: "VNQ", target_weight: 10, min_weight: 6, max_weight: 14, enabled: true, accepts_contributions: true, is_legacy: false, legacy_label: null, priority: 3, strategy_bucket: "REAL ESTATE" },
  { ticker: "VOO", target_weight: 0, min_weight: null, max_weight: null, enabled: true, accepts_contributions: false, is_legacy: true, legacy_label: "Posição legada / Anchor", priority: 9, strategy_bucket: "LEGADO" },
];

export const ASSET_META: Record<string, { name: string; isEtf: boolean }> = {
  META: { name: "Meta Platforms", isEtf: false },
  NVDA: { name: "NVIDIA", isEtf: false },
  MSFT: { name: "Microsoft", isEtf: false },
  AAPL: { name: "Apple", isEtf: false },
  GOOGL: { name: "Alphabet (A)", isEtf: false },
  "BRK.B": { name: "Berkshire Hathaway (B)", isEtf: false },
  JEPQ: { name: "JPMorgan Nasdaq Equity Premium Income ETF", isEtf: true },
  LQD: { name: "iShares iBoxx $ Inv. Grade Corporate Bond ETF", isEtf: true },
  VNQ: { name: "Vanguard Real Estate ETF", isEtf: true },
  VOO: { name: "Vanguard S&P 500 ETF", isEtf: true },
};

export function assetMeta(ticker: string) {
  return ASSET_META[ticker] ?? { name: ticker, isEtf: false };
}
