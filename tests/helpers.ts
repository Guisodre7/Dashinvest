import type { StrategyRow } from "@/lib/analysis/analyze";
import type { DailyBar, DataMeta, Quote } from "@/lib/market/types";

export function meta(overrides: Partial<DataMeta> = {}): DataMeta {
  return {
    timestamp: new Date().toISOString(), source: "test", data_age: 0, market_status: "CLOSED",
    is_realtime: true, is_delayed: false, delay_minutes: 0, ...overrides,
  };
}

export function bars(closes: number[], start = "2025-01-01"): DailyBar[] {
  const d = new Date(`${start}T00:00:00Z`);
  return closes.map((c) => {
    d.setUTCDate(d.getUTCDate() + 1);
    return { time: d.toISOString().slice(0, 10), open: c, high: c * 1.005, low: c * 0.995, close: c, volume: 1_000_000 };
  });
}

export function quote(ticker: string, price: number, m: Partial<DataMeta> = {}): Quote {
  return {
    ticker, name: ticker, price, bid: null, ask: null, spread: null, change: 0, change_pct: 0,
    open: price, high: price, low: price, prev_close: price, volume: null, avg_volume: null,
    week52_high: null, week52_low: null, session: "REGULAR", meta: meta(m),
  };
}

export function strategy(ticker: string, target: number, extra: Partial<StrategyRow> = {}): StrategyRow {
  return {
    ticker, target_weight: target, min_weight: null, max_weight: null, enabled: true,
    accepts_contributions: true, is_legacy: false, legacy_label: null, priority: 1, strategy_bucket: "TEST", ...extra,
  };
}
