import "server-only";
import { buildMeta } from "../freshness";
import { getJson, HttpError, toNum } from "../http";
import { statusAt } from "../marketStatus";
import type { Capability, EtfProfile, FxRate, MarketDataProvider } from "../provider";
import {
  ProviderUnavailableError,
  type AnalystData, type DividendInfo, type EarningsEstimates, type EstimatePeriod,
  type Fundamentals, type MacroIndicator, type MarketEvent, type NewsItem,
  type PriceHistory, type Quote,
} from "../types";

const BASE = "https://finnhub.io/api/v1";
const NAME = "finnhub";

// Finnhub usa "BRK.B"; mantemos o ticker da aplicação.
const symbol = (t: string) => t.toUpperCase();

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * Finnhub — cotações US em tempo real (plano gratuito cobre trades US),
 * métricas fundamentais, consenso de analistas, notícias e calendário.
 * Endpoints premium (price-target, upgrade-downgrade, eps-estimate) degradam
 * graciosamente para `null` quando o plano não os inclui.
 */
export class FinnhubProvider implements MarketDataProvider {
  readonly name = NAME;
  readonly capabilities: ReadonlySet<Capability> = new Set<Capability>([
    "quote", "fundamentals", "estimates", "analysts", "news", "marketNews", "events",
  ]);

  constructor(private apiKey: string, private realtime = true) {}

  private url(path: string, params: Record<string, string>) {
    const q = new URLSearchParams({ ...params, token: this.apiKey });
    return `${BASE}${path}?${q.toString()}`;
  }

  private get<T>(endpoint: string, params: Record<string, string>, revalidate: number, ticker?: string) {
    return getJson<T>(NAME, endpoint, this.url(endpoint, params), { revalidate, ticker });
  }

  /** Endpoints premium: 401/403 => null (sem inventar valor). */
  private async optional<T>(endpoint: string, params: Record<string, string>, revalidate: number, ticker?: string): Promise<T | null> {
    try {
      return await this.get<T>(endpoint, params, revalidate, ticker);
    } catch (err) {
      if (err instanceof HttpError && (err.status === 401 || err.status === 403)) return null;
      throw err;
    }
  }

  async getQuote(ticker: string): Promise<Quote> {
    const [q, profile, metric] = await Promise.all([
      this.get<{ c: number; d: number; dp: number; h: number; l: number; o: number; pc: number; t: number }>(
        // 5s de cache compartilhado; o timestamp da cotação continua sendo o do fornecedor.
        "/quote", { symbol: symbol(ticker) }, 5, ticker),
      this.optional<{ name?: string }>("/stock/profile2", { symbol: symbol(ticker) }, 86_400, ticker).catch(() => null),
      this.metrics(ticker).catch(() => null),
    ]);
    if (!q || !q.t || !q.c) throw new ProviderUnavailableError(NAME, "quote", `sem cotação para ${ticker}`);
    const timestamp = new Date(q.t * 1000).toISOString();
    const status = statusAt(timestamp);
    const m = metric?.metric ?? {};
    const avgVol = toNum(m["10DayAverageTradingVolume"]);
    return {
      ticker,
      name: profile?.name ?? null,
      price: toNum(q.c),
      bid: null, // bid/ask exigem plano premium; não inventamos.
      ask: null,
      spread: null,
      change: toNum(q.d),
      change_pct: toNum(q.dp),
      open: toNum(q.o),
      high: toNum(q.h),
      low: toNum(q.l),
      prev_close: toNum(q.pc),
      volume: null,
      avg_volume: avgVol !== null ? avgVol * 1_000_000 : null,
      week52_high: toNum(m["52WeekHigh"]),
      week52_low: toNum(m["52WeekLow"]),
      session: status === "OPEN" || status === "CLOSED" ? "REGULAR" : "EXTENDED",
      meta: buildMeta({ timestamp, source: NAME, is_realtime: this.realtime }),
    };
  }

  async getDailyHistory(): Promise<PriceHistory> {
    // /stock/candle é premium desde 2024 — histórico vem de outro fornecedor.
    throw new ProviderUnavailableError(NAME, "history");
  }

  private metrics(ticker: string) {
    return this.get<{
      metric: Record<string, number | null>;
      series?: { annual?: Record<string, { period: string; v: number }[]> };
    }>("/stock/metric", { symbol: symbol(ticker), metric: "all" }, 6 * 3600, ticker);
  }

  async getFundamentals(ticker: string): Promise<Fundamentals> {
    const [data, profile] = await Promise.all([
      this.metrics(ticker),
      this.optional<{ name?: string; finnhubIndustry?: string; marketCapitalization?: number }>(
        "/stock/profile2", { symbol: symbol(ticker) }, 86_400, ticker),
    ]);
    const m = data.metric ?? {};
    if (!Object.keys(m).length) throw new ProviderUnavailableError(NAME, "fundamentals", ticker);
    const annualPe = data.series?.annual?.pe ?? [];
    const annualPs = data.series?.annual?.ps ?? [];
    const avg = (arr: { v: number }[]) => {
      const last = arr.slice(0, 5).map((x) => x.v).filter((v) => Number.isFinite(v) && v > 0);
      return last.length >= 3 ? last.reduce((a, b) => a + b, 0) / last.length : null;
    };
    const pfcf = toNum(m.pfcfShareTTM);
    return {
      ticker,
      name: profile?.name ?? null,
      sector: profile?.finnhubIndustry ?? null,
      market_cap: toNum(m.marketCapitalization) !== null ? toNum(m.marketCapitalization)! * 1_000_000 : null,
      pe: toNum(m.peTTM) ?? toNum(m.peExclExtraTTM),
      forward_pe: toNum(m.forwardPE),
      peg: toNum(m.pegTTM),
      ps: toNum(m.psTTM),
      pfcf,
      ev_ebitda: toNum(m["evEbitdaTTM"]),
      fcf_yield: pfcf && pfcf > 0 ? 100 / pfcf : null,
      dividend_yield: toNum(m.dividendYieldIndicatedAnnual) ?? toNum(m.currentDividendYieldTTM),
      revenue_growth_yoy: toNum(m.revenueGrowthTTMYoy),
      eps_growth_yoy: toNum(m.epsGrowthTTMYoy),
      revenue_growth_3y: toNum(m.revenueGrowth3Y),
      eps_growth_3y: toNum(m.epsGrowth3Y),
      fcf_growth: toNum(m.focfCagr5Y),
      operating_margin: toNum(m.operatingMarginTTM),
      net_margin: toNum(m.netProfitMarginTTM),
      roe: toNum(m.roeTTM),
      roic: toNum(m.roiTTM),
      debt_to_equity: toNum(m["totalDebt/totalEquityQuarterly"]),
      current_ratio: toNum(m.currentRatioQuarterly),
      shares_change_yoy: null,
      eps_ttm: toNum(m.epsTTM) ?? toNum(m.epsExclExtraItemsTTM),
      beta: toNum(m.beta),
      pe_5y_avg: avg(annualPe),
      ps_5y_avg: avg(annualPs),
      week52_high: toNum(m["52WeekHigh"]),
      week52_low: toNum(m["52WeekLow"]),
      meta: buildMeta({ timestamp: new Date().toISOString(), source: NAME, is_realtime: false }),
    };
  }

  async getEarningsEstimates(ticker: string): Promise<EarningsEstimates> {
    const [surprises, epsQ, epsA, revQ, revA] = await Promise.all([
      this.get<{ actual: number | null; estimate: number | null; period: string; surprisePercent: number | null }[]>(
        "/stock/earnings", { symbol: symbol(ticker) }, 12 * 3600, ticker),
      this.optional<{ data: EstRow[] }>("/stock/eps-estimate", { symbol: symbol(ticker), freq: "quarterly" }, 12 * 3600, ticker),
      this.optional<{ data: EstRow[] }>("/stock/eps-estimate", { symbol: symbol(ticker), freq: "annual" }, 12 * 3600, ticker),
      this.optional<{ data: RevRow[] }>("/stock/revenue-estimate", { symbol: symbol(ticker), freq: "quarterly" }, 12 * 3600, ticker),
      this.optional<{ data: RevRow[] }>("/stock/revenue-estimate", { symbol: symbol(ticker), freq: "annual" }, 12 * 3600, ticker),
    ]);
    const today = isoDate(new Date());
    const future = <R extends { period: string }>(rows: R[] | undefined) =>
      (rows ?? []).filter((r) => r.period >= today).sort((a, b) => a.period.localeCompare(b.period));
    const periods: EstimatePeriod[] = [];
    const push = (label: string, e: EstRow | undefined, r: RevRow | undefined) => {
      if (!e && !r) return;
      periods.push({
        period: label,
        period_end: e?.period ?? r?.period ?? null,
        eps_avg: toNum(e?.epsAvg), eps_low: toNum(e?.epsLow), eps_high: toNum(e?.epsHigh),
        revenue_avg: toNum(r?.revenueAvg), revenue_low: toNum(r?.revenueLow), revenue_high: toNum(r?.revenueHigh),
        analyst_count: toNum(e?.numberAnalysts),
        eps_revision_30d_pct: null, eps_revision_90d_pct: null,
      });
    };
    const eq = future(epsQ?.data), ea = future(epsA?.data), rq = future(revQ?.data), ra = future(revA?.data);
    push("0q", eq[0], rq[0]);
    push("+1q", eq[1], rq[1]);
    push("0y", ea[0], ra[0]);
    push("+1y", ea[1], ra[1]);
    if (!periods.length && !surprises?.length) throw new ProviderUnavailableError(NAME, "estimates", ticker);
    return {
      ticker,
      periods,
      surprises: (surprises ?? []).slice(0, 8).map((s) => ({
        period: s.period, actual: toNum(s.actual), estimate: toNum(s.estimate), surprise_pct: toNum(s.surprisePercent),
      })),
      meta: buildMeta({ timestamp: new Date().toISOString(), source: NAME, is_realtime: false }),
    };
  }

  async getAnalystData(ticker: string): Promise<AnalystData> {
    const [recs, target, grades] = await Promise.all([
      this.get<{ period: string; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number }[]>(
        "/stock/recommendation", { symbol: symbol(ticker) }, 12 * 3600, ticker),
      this.optional<{ targetHigh: number; targetLow: number; targetMean: number; targetMedian: number; lastUpdated: string }>(
        "/stock/price-target", { symbol: symbol(ticker) }, 12 * 3600, ticker),
      this.optional<{ gradeTime: number; action: string }[]>(
        "/stock/upgrade-downgrade", {
          symbol: symbol(ticker),
          from: isoDate(new Date(Date.now() - 90 * 86_400_000)),
          to: isoDate(new Date()),
        }, 12 * 3600, ticker),
    ]);
    const now = Date.now();
    const count = (days: number, action: "up" | "down") =>
      grades ? grades.filter((g) => g.action === action && now - g.gradeTime * 1000 <= days * 86_400_000).length : null;
    const lastGrade = grades?.length ? Math.max(...grades.map((g) => g.gradeTime)) : null;
    return {
      ticker,
      recommendations: (recs ?? []).map((r) => ({
        period: r.period, strong_buy: r.strongBuy, buy: r.buy, hold: r.hold, sell: r.sell, strong_sell: r.strongSell,
      })),
      target_mean: toNum(target?.targetMean),
      target_median: toNum(target?.targetMedian),
      target_low: toNum(target?.targetLow),
      target_high: toNum(target?.targetHigh),
      target_updated_at: target?.lastUpdated ?? null,
      upgrades_30d: count(30, "up"),
      downgrades_30d: count(30, "down"),
      upgrades_90d: count(90, "up"),
      downgrades_90d: count(90, "down"),
      last_revision_at: lastGrade ? new Date(lastGrade * 1000).toISOString() : (recs?.[0]?.period ?? null),
      meta: buildMeta({ timestamp: new Date().toISOString(), source: NAME, is_realtime: false }),
    };
  }

  async getNews(ticker: string, days: number): Promise<NewsItem[]> {
    const rows = await this.get<FinnhubNews[]>("/company-news", {
      symbol: symbol(ticker),
      from: isoDate(new Date(Date.now() - days * 86_400_000)),
      to: isoDate(new Date()),
    }, 300, ticker);
    return (rows ?? []).slice(0, 50).map((n) => mapNews(n, ticker));
  }

  async getMarketNews(): Promise<NewsItem[]> {
    const rows = await this.get<FinnhubNews[]>("/news", { category: "general" }, 300);
    return (rows ?? []).slice(0, 40).map((n) => mapNews(n, null));
  }

  async getEvents(tickers: string[], fromDate: string, toDate: string): Promise<MarketEvent[]> {
    const data = await this.get<{ earningsCalendar: { date: string; hour: string; symbol: string; epsEstimate: number | null; revenueEstimate: number | null; quarter: number; year: number }[] }>(
      "/calendar/earnings", { from: fromDate, to: toDate }, 6 * 3600);
    const wanted = new Set(tickers.map(symbol));
    return (data.earningsCalendar ?? [])
      .filter((e) => wanted.has(e.symbol))
      .map((e) => ({
        ticker: e.symbol,
        kind: "earnings" as const,
        title: `Resultado ${e.quarter}T${e.year}`,
        date: e.date,
        time: e.hour || null,
        source: NAME,
        details: { eps_estimate: e.epsEstimate, revenue_estimate: e.revenueEstimate },
      }));
  }

  async getDividends(): Promise<DividendInfo> {
    throw new ProviderUnavailableError(NAME, "dividends");
  }
  async getFxRate(): Promise<FxRate> {
    throw new ProviderUnavailableError(NAME, "fx");
  }
  async getMacro(): Promise<MacroIndicator[]> {
    throw new ProviderUnavailableError(NAME, "macro");
  }
  async getEtfProfile(): Promise<EtfProfile> {
    throw new ProviderUnavailableError(NAME, "etfProfile");
  }
}

interface EstRow { period: string; epsAvg: number; epsHigh: number; epsLow: number; numberAnalysts: number }
interface RevRow { period: string; revenueAvg: number; revenueHigh: number; revenueLow: number; numberAnalysts: number }
interface FinnhubNews { id: number; headline: string; summary: string; url: string; source: string; datetime: number; related: string; category: string }

function mapNews(n: FinnhubNews, ticker: string | null): NewsItem {
  return {
    id: `finnhub-${n.id}`,
    ticker,
    title: n.headline,
    summary: n.summary || null,
    url: n.url || null,
    source: n.source || "desconhecida",
    provider: NAME,
    published_at: new Date(n.datetime * 1000).toISOString(),
    updated_at: null,
    provider_sentiment: null,
    provider_relevance: null,
  };
}
