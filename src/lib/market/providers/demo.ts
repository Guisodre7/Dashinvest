import "server-only";
import { buildMeta } from "../freshness";
import type { Capability, EtfProfile, FxRate, MarketDataProvider } from "../provider";
import type {
  AnalystData, DailyBar, DividendInfo, EarningsEstimates, Fundamentals,
  MacroIndicator, MarketEvent, NewsItem, PriceHistory, Quote,
} from "../types";

/**
 * FORNECEDOR SINTÉTICO — SOMENTE DESENVOLVIMENTO LOCAL.
 * Gera séries determinísticas para testar a interface sem API keys.
 * Recusado em produção (ver getMarketDataProvider). Os dados são marcados
 * como `source: "demo"` e a UI exibe um aviso permanente.
 */
const NAME = "demo";

const BASE_PRICE: Record<string, number> = {
  META: 700, NVDA: 175, MSFT: 510, AAPL: 240, GOOGL: 235, "BRK.B": 480,
  JEPQ: 57, LQD: 110, VNQ: 92, VOO: 600, SPY: 655, QQQ: 590, DIA: 460, UUP: 27,
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function seedOf(t: string) {
  return [...t].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
}

function series(ticker: string): DailyBar[] {
  const r = rng(seedOf(ticker));
  const bars: DailyBar[] = [];
  const base = BASE_PRICE[ticker] ?? 100;
  const days = 420;
  let p = base * (0.7 + r() * 0.3);
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - Math.round(days * 1.45));
  const vol = ticker === "LQD" ? 0.004 : ["JEPQ", "VNQ", "VOO"].includes(ticker) ? 0.009 : 0.018;
  while (bars.length < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const drift = (base - p) / base * 0.004 + 0.0004;
    const ret = drift + (r() - 0.5) * 2 * vol;
    const open = p;
    p = Math.max(1, p * (1 + ret));
    const hi = Math.max(open, p) * (1 + r() * vol * 0.6);
    const lo = Math.min(open, p) * (1 - r() * vol * 0.6);
    bars.push({ time: d.toISOString().slice(0, 10), open, high: hi, low: lo, close: p, volume: Math.round(1e6 * (5 + r() * 20)) });
  }
  return bars;
}

export class DemoProvider implements MarketDataProvider {
  readonly name = NAME;
  readonly capabilities: ReadonlySet<Capability> = new Set<Capability>([
    "quote", "history", "fundamentals", "estimates", "analysts", "news", "marketNews",
    "events", "dividends", "fx", "macro", "etfProfile",
  ]);

  async getQuote(ticker: string): Promise<Quote> {
    const bars = series(ticker);
    const last = bars[bars.length - 1], prev = bars[bars.length - 2];
    const year = bars.slice(-252);
    return {
      ticker, name: `${ticker} (demo)`,
      price: last.close, bid: last.close * 0.9998, ask: last.close * 1.0002, spread: last.close * 0.0004,
      change: last.close - prev.close, change_pct: ((last.close - prev.close) / prev.close) * 100,
      open: last.open, high: last.high, low: last.low, prev_close: prev.close,
      volume: last.volume, avg_volume: year.slice(-20).reduce((a, b) => a + b.volume, 0) / 20,
      week52_high: Math.max(...year.map((b) => b.high)), week52_low: Math.min(...year.map((b) => b.low)),
      session: "REGULAR",
      meta: buildMeta({ timestamp: new Date(Date.now() - 5_000).toISOString(), source: NAME, is_realtime: false }),
    };
  }

  async getDailyHistory(ticker: string): Promise<PriceHistory> {
    return { ticker, bars: series(ticker), adjusted: true, meta: buildMeta({ timestamp: new Date().toISOString(), source: NAME, is_realtime: false }) };
  }

  async getFundamentals(ticker: string): Promise<Fundamentals> {
    const r = rng(seedOf(ticker) + 1);
    const etf = ["JEPQ", "LQD", "VNQ", "VOO"].includes(ticker);
    const v = (lo: number, hi: number) => (etf ? null : lo + r() * (hi - lo));
    const pe = v(18, 45);
    return {
      ticker, name: `${ticker} (demo)`, sector: etf ? null : "Technology", market_cap: etf ? null : 1e12 * (1 + r() * 3),
      pe, forward_pe: pe ? pe * (0.75 + r() * 0.2) : null, peg: v(0.9, 2.5), ps: v(5, 20), pfcf: v(20, 50),
      ev_ebitda: v(12, 35), fcf_yield: v(2, 5), dividend_yield: etf ? { JEPQ: 10.5, LQD: 4.4, VNQ: 3.9, VOO: 1.2 }[ticker]! : r() * 0.8,
      revenue_growth_yoy: v(5, 40), eps_growth_yoy: v(5, 50), revenue_growth_3y: v(5, 30), eps_growth_3y: v(5, 35),
      fcf_growth: v(0, 30), operating_margin: v(20, 55), net_margin: v(15, 45), roe: v(15, 60), roic: v(12, 40),
      debt_to_equity: v(0.1, 1), current_ratio: v(0.9, 3), shares_change_yoy: v(-3, 0.5), eps_ttm: v(5, 25), beta: v(0.8, 1.8),
      pe_5y_avg: pe ? pe * (0.8 + r() * 0.4) : null, ps_5y_avg: v(5, 18), week52_high: null, week52_low: null,
      meta: buildMeta({ timestamp: new Date().toISOString(), source: NAME, is_realtime: false }),
    };
  }

  async getEarningsEstimates(ticker: string): Promise<EarningsEstimates> {
    if (["JEPQ", "LQD", "VNQ", "VOO"].includes(ticker)) throw new Error("demo: ETF sem estimativas");
    const r = rng(seedOf(ticker) + 2);
    const eps = 5 + r() * 20;
    const rev = (x: number) => (r() - 0.4) * x;
    return {
      ticker,
      periods: ["0q", "+1q", "0y", "+1y"].map((period, i) => ({
        period, period_end: null,
        eps_avg: i < 2 ? eps / 4 : eps * (i === 3 ? 1.15 : 1), eps_low: null, eps_high: null,
        revenue_avg: 1e10 * (i < 2 ? 1 : 4), revenue_low: null, revenue_high: null, analyst_count: 30 + Math.round(r() * 20),
        eps_revision_30d_pct: rev(6), eps_revision_90d_pct: rev(12),
      })),
      surprises: [0, 1, 2, 3].map((i) => ({ period: `Q-${i}`, actual: 1, estimate: 0.95, surprise_pct: (r() - 0.3) * 10 })),
      meta: buildMeta({ timestamp: new Date().toISOString(), source: NAME, is_realtime: false }),
    };
  }

  async getAnalystData(ticker: string): Promise<AnalystData> {
    if (["JEPQ", "LQD", "VNQ", "VOO"].includes(ticker)) throw new Error("demo: ETF sem analistas");
    const r = rng(seedOf(ticker) + 3);
    const price = (await this.getQuote(ticker)).price!;
    const mean = price * (1 + (r() - 0.25) * 0.3);
    return {
      ticker,
      recommendations: [0, 1, 2, 3].map((m) => ({
        period: new Date(Date.now() - m * 30 * 86_400_000).toISOString().slice(0, 10),
        strong_buy: 10 + Math.round(r() * 8), buy: 20 + Math.round(r() * 10), hold: 8 + Math.round(r() * 6), sell: Math.round(r() * 3), strong_sell: 0,
      })),
      target_mean: mean, target_median: mean, target_low: mean * 0.7, target_high: mean * 1.35, target_updated_at: new Date().toISOString(),
      upgrades_30d: Math.round(r() * 5), downgrades_30d: Math.round(r() * 3), upgrades_90d: Math.round(r() * 12), downgrades_90d: Math.round(r() * 6),
      last_revision_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      meta: buildMeta({ timestamp: new Date().toISOString(), source: NAME, is_realtime: false }),
    };
  }

  async getNews(ticker: string): Promise<NewsItem[]> {
    return [{
      id: `demo-${ticker}`, ticker, title: `[DEMO] Notícia sintética sobre ${ticker}`, summary: "Texto de demonstração — não é uma notícia real.",
      url: null, source: "Demo", provider: NAME, published_at: new Date(Date.now() - 3 * 3600_000).toISOString(), updated_at: null,
      provider_sentiment: null, provider_relevance: 1,
    }];
  }

  async getMarketNews(): Promise<NewsItem[]> {
    return [];
  }

  async getEvents(tickers: string[]): Promise<MarketEvent[]> {
    return tickers.filter((t) => !["JEPQ", "LQD", "VNQ", "VOO"].includes(t)).map((t, i) => ({
      ticker: t, kind: "earnings" as const, title: "Resultado trimestral (demo)",
      date: new Date(Date.now() + (5 + i * 6) * 86_400_000).toISOString().slice(0, 10), time: "amc", source: NAME, details: {},
    }));
  }

  async getDividends(ticker: string): Promise<DividendInfo> {
    return { ticker, kind: "distribution", history: [], trailing_12m: null, meta: buildMeta({ timestamp: new Date().toISOString(), source: NAME, is_realtime: false }) };
  }

  async getFxRate(): Promise<FxRate> {
    return { pair: "USDBRL", rate: 5.35, timestamp: new Date().toISOString(), source: NAME, is_realtime: false, change_1m: -1.2 };
  }

  async getMacro(): Promise<MacroIndicator[]> {
    const meta = buildMeta({ timestamp: new Date().toISOString(), source: NAME, is_realtime: false });
    return [
      { key: "US10Y", label: "Treasury 10 anos", value: 4.15, change: 0.02, change_pct: null, change_1m: -0.12, unit: "percent", proxy: null, meta },
      { key: "FEDFUNDS", label: "Fed Funds (efetiva)", value: 4.08, change: 0, change_pct: null, change_1m: -0.25, unit: "percent", proxy: null, meta },
    ];
  }

  async getEtfProfile(ticker: string): Promise<EtfProfile> {
    return { ticker, net_assets: null, expense_ratio: null, dividend_yield: null, turnover: null, inception_date: null, holdings: [], sectors: [], source: NAME, as_of: new Date().toISOString() };
  }
}
