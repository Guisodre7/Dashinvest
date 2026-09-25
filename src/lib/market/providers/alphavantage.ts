import "server-only";
import { buildMeta } from "../freshness";
import { blockEndpoint, getJson, toNum } from "../http";
import { statusAt } from "../marketStatus";
import type { Capability, EtfProfile, FxRate, MarketDataProvider } from "../provider";
import {
  ProviderUnavailableError,
  type AnalystData, type DividendInfo, type EarningsEstimates, type EstimatePeriod,
  type Fundamentals, type MacroIndicator, type MarketEvent, type NewsItem,
  type PriceHistory, type Quote,
} from "../types";

const BASE = "https://www.alphavantage.co/query";
const NAME = "alphavantage";

// Alpha Vantage usa hífen para classes de ações.
const symbol = (t: string) => t.toUpperCase().replace(".", "-");

type AvBody = Record<string, unknown> & { Note?: string; Information?: string; "Error Message"?: string };

/**
 * Alpha Vantage — histórico diário, fundamentos (OVERVIEW), estimativas com
 * histórico de revisões (EARNINGS_ESTIMATES), notícias com sentimento,
 * dividendos, perfil de ETFs, câmbio e juros.
 * No plano gratuito as cotações são atrasadas; `realtime` só deve ser true
 * quando o plano contratado incluir dados US em tempo real.
 */
export class AlphaVantageProvider implements MarketDataProvider {
  readonly name = NAME;
  readonly capabilities: ReadonlySet<Capability> = new Set<Capability>([
    "quote", "history", "fundamentals", "estimates", "analysts", "news", "marketNews",
    "dividends", "fx", "macro", "etfProfile",
  ]);

  constructor(private apiKey: string, private realtime = false) {}

  private async call<T extends AvBody>(fn: string, params: Record<string, string>, revalidate: number, ticker?: string): Promise<T> {
    const q = new URLSearchParams({ function: fn, ...params, apikey: this.apiKey });
    if (fn === "GLOBAL_QUOTE" && this.realtime) q.set("entitlement", "realtime");
    const body = await getJson<T>(NAME, fn, `${BASE}?${q.toString()}`, { revalidate, ticker });
    const problem = body["Error Message"] ?? body.Note ?? body.Information;
    if (problem) {
      const text = String(problem);
      // Limite diário/por minuto → pausa o fornecedor; função premium → pausa só a função.
      if (/rate limit|requests per|per day|frequency/i.test(text)) blockEndpoint(`${NAME}|*`, 429, 30 * 60_000);
      else if (/premium/i.test(text)) blockEndpoint(`${NAME}|${fn}`, 403, 12 * 3600_000);
      throw new ProviderUnavailableError(NAME, fn, text.slice(0, 160));
    }
    return body;
  }

  async getQuote(ticker: string): Promise<Quote> {
    const body = await this.call<AvBody>("GLOBAL_QUOTE", { symbol: symbol(ticker) }, 0, ticker);
    const g = (body["Global Quote"] ?? body["Global Quote - DATA DELAYED BY 15 MINUTES"]) as Record<string, string> | undefined;
    if (!g || !g["05. price"]) throw new ProviderUnavailableError(NAME, "quote", ticker);
    // GLOBAL_QUOTE informa apenas o dia de negociação — usamos o fechamento
    // regular (16:00 ET) do dia informado se o pregão já terminou; caso
    // contrário, o horário da consulta menos o atraso contratual.
    const delay = this.realtime ? 0 : 15;
    const day = g["07. latest trading day"];
    const closeTs = etCloseIso(day);
    const approx = new Date(Date.now() - delay * 60_000).toISOString();
    const timestamp = closeTs < approx ? closeTs : approx;
    const status = statusAt(timestamp);
    return {
      ticker,
      name: null,
      price: toNum(g["05. price"]),
      bid: null,
      ask: null,
      spread: null,
      change: toNum(g["09. change"]),
      change_pct: toNum(String(g["10. change percent"] ?? "").replace("%", "")),
      open: toNum(g["02. open"]),
      high: toNum(g["03. high"]),
      low: toNum(g["04. low"]),
      prev_close: toNum(g["08. previous close"]),
      volume: toNum(g["06. volume"]),
      avg_volume: null,
      week52_high: null,
      week52_low: null,
      session: status === "OPEN" || status === "CLOSED" ? "REGULAR" : "EXTENDED",
      meta: buildMeta({ timestamp, source: NAME, is_realtime: this.realtime, delay_minutes: delay }),
    };
  }

  async getDailyHistory(ticker: string): Promise<PriceHistory> {
    let body: AvBody;
    let adjusted = true;
    try {
      body = await this.call<AvBody>("TIME_SERIES_DAILY_ADJUSTED", { symbol: symbol(ticker), outputsize: "full" }, 3600, ticker);
    } catch {
      adjusted = false;
      body = await this.call<AvBody>("TIME_SERIES_DAILY", { symbol: symbol(ticker), outputsize: "compact" }, 3600, ticker);
    }
    const series = body["Time Series (Daily)"] as Record<string, Record<string, string>> | undefined;
    if (!series) throw new ProviderUnavailableError(NAME, "history", ticker);
    const bars = Object.entries(series)
      .map(([date, v]) => {
        const close = toNum(v["4. close"])!;
        const adjClose = adjusted ? toNum(v["5. adjusted close"]) : null;
        const factor = adjClose && close ? adjClose / close : 1;
        return {
          time: date,
          open: toNum(v["1. open"])! * factor,
          high: toNum(v["2. high"])! * factor,
          low: toNum(v["3. low"])! * factor,
          close: close * factor,
          volume: toNum(v[adjusted ? "6. volume" : "5. volume"]) ?? 0,
        };
      })
      .filter((b) => Number.isFinite(b.close))
      .sort((a, b) => a.time.localeCompare(b.time));
    const last = bars[bars.length - 1];
    return {
      ticker,
      bars,
      adjusted,
      meta: buildMeta({ timestamp: etCloseIso(last.time), source: NAME, is_realtime: false }),
    };
  }

  private overview(ticker: string) {
    return this.call<Record<string, string> & AvBody>("OVERVIEW", { symbol: symbol(ticker) }, 12 * 3600, ticker);
  }

  async getFundamentals(ticker: string): Promise<Fundamentals> {
    const o = await this.overview(ticker);
    if (!o.Symbol) throw new ProviderUnavailableError(NAME, "fundamentals", ticker);
    const pct = (v: unknown) => (toNum(v) === null ? null : toNum(v)! * 100);
    const eps = toNum(o.EPS);
    return {
      ticker,
      name: o.Name ?? null,
      sector: o.Sector ?? null,
      market_cap: toNum(o.MarketCapitalization),
      pe: toNum(o.PERatio) ?? toNum(o.TrailingPE),
      forward_pe: toNum(o.ForwardPE),
      peg: toNum(o.PEGRatio),
      ps: toNum(o.PriceToSalesRatioTTM),
      pfcf: null,
      ev_ebitda: toNum(o.EVToEBITDA),
      fcf_yield: null,
      dividend_yield: pct(o.DividendYield),
      revenue_growth_yoy: pct(o.QuarterlyRevenueGrowthYOY),
      eps_growth_yoy: pct(o.QuarterlyEarningsGrowthYOY),
      revenue_growth_3y: null,
      eps_growth_3y: null,
      fcf_growth: null,
      operating_margin: pct(o.OperatingMarginTTM),
      net_margin: pct(o.ProfitMargin),
      roe: pct(o.ReturnOnEquityTTM),
      roic: null,
      debt_to_equity: null,
      current_ratio: null,
      shares_change_yoy: null,
      eps_ttm: eps,
      beta: toNum(o.Beta),
      pe_5y_avg: null,
      ps_5y_avg: null,
      week52_high: toNum(o["52WeekHigh"]),
      week52_low: toNum(o["52WeekLow"]),
      meta: buildMeta({
        timestamp: o.LatestQuarter ? new Date(o.LatestQuarter).toISOString() : new Date().toISOString(),
        source: NAME, is_realtime: false,
      }),
    };
  }

  async getEarningsEstimates(ticker: string): Promise<EarningsEstimates> {
    const [est, earn] = await Promise.all([
      this.call<AvBody>("EARNINGS_ESTIMATES", { symbol: symbol(ticker) }, 12 * 3600, ticker).catch(() => null),
      this.call<AvBody>("EARNINGS", { symbol: symbol(ticker) }, 12 * 3600, ticker).catch(() => null),
    ]);
    const rows = ((est?.estimates as Record<string, string>[] | undefined) ?? []);
    const horizonMap: Record<string, string> = {
      "current fiscal quarter": "0q", "next fiscal quarter": "+1q",
      "current fiscal year": "0y", "next fiscal year": "+1y",
    };
    const revision = (now: number | null, ago: number | null) =>
      now !== null && ago !== null && ago !== 0 ? ((now - ago) / Math.abs(ago)) * 100 : null;
    const periods: EstimatePeriod[] = rows
      .filter((r) => horizonMap[String(r.horizon ?? "").toLowerCase()])
      .map((r) => {
        const avg = toNum(r.eps_estimate_average);
        return {
          period: horizonMap[String(r.horizon).toLowerCase()],
          period_end: r.date ?? null,
          eps_avg: avg,
          eps_low: toNum(r.eps_estimate_low),
          eps_high: toNum(r.eps_estimate_high),
          revenue_avg: toNum(r.revenue_estimate_average),
          revenue_low: toNum(r.revenue_estimate_low),
          revenue_high: toNum(r.revenue_estimate_high),
          analyst_count: toNum(r.eps_estimate_analyst_count),
          eps_revision_30d_pct: revision(avg, toNum(r.eps_estimate_average_30_days_ago)),
          eps_revision_90d_pct: revision(avg, toNum(r.eps_estimate_average_90_days_ago)),
        };
      });
    const q = ((earn?.quarterlyEarnings as Record<string, string>[] | undefined) ?? []).slice(0, 8);
    if (!periods.length && !q.length) throw new ProviderUnavailableError(NAME, "estimates", ticker);
    return {
      ticker,
      periods,
      surprises: q.map((r) => ({
        period: r.fiscalDateEnding,
        actual: toNum(r.reportedEPS),
        estimate: toNum(r.estimatedEPS),
        surprise_pct: toNum(r.surprisePercentage),
      })),
      meta: buildMeta({ timestamp: new Date().toISOString(), source: NAME, is_realtime: false }),
    };
  }

  async getAnalystData(ticker: string): Promise<AnalystData> {
    const o = await this.overview(ticker);
    if (!o.Symbol) throw new ProviderUnavailableError(NAME, "analysts", ticker);
    const n = (k: string) => toNum(o[k]) ?? 0;
    const hasRatings = ["AnalystRatingStrongBuy", "AnalystRatingBuy", "AnalystRatingHold"].some((k) => toNum(o[k]) !== null);
    return {
      ticker,
      recommendations: hasRatings
        ? [{
            period: new Date().toISOString().slice(0, 10),
            strong_buy: n("AnalystRatingStrongBuy"), buy: n("AnalystRatingBuy"), hold: n("AnalystRatingHold"),
            sell: n("AnalystRatingSell"), strong_sell: n("AnalystRatingStrongSell"),
          }]
        : [],
      target_mean: toNum(o.AnalystTargetPrice),
      target_median: null,
      target_low: null,
      target_high: null,
      target_updated_at: null,
      upgrades_30d: null, downgrades_30d: null, upgrades_90d: null, downgrades_90d: null,
      last_revision_at: null,
      meta: buildMeta({ timestamp: new Date().toISOString(), source: NAME, is_realtime: false }),
    };
  }

  async getNews(ticker: string, days: number): Promise<NewsItem[]> {
    const from = new Date(Date.now() - days * 86_400_000);
    const body = await this.call<AvBody>("NEWS_SENTIMENT", {
      tickers: symbol(ticker), time_from: avTime(from), sort: "LATEST", limit: "50",
    }, 300, ticker);
    return mapAvNews(body, ticker);
  }

  async getMarketNews(): Promise<NewsItem[]> {
    const body = await this.call<AvBody>("NEWS_SENTIMENT", {
      topics: "financial_markets,economy_monetary,economy_macro", sort: "LATEST", limit: "40",
    }, 300);
    return mapAvNews(body, null);
  }

  async getEvents(): Promise<MarketEvent[]> {
    throw new ProviderUnavailableError(NAME, "events");
  }

  async getDividends(ticker: string): Promise<DividendInfo> {
    const body = await this.call<AvBody>("DIVIDENDS", { symbol: symbol(ticker) }, 12 * 3600, ticker);
    const data = (body.data as Record<string, string>[] | undefined) ?? [];
    const history = data
      .map((d) => ({ ex_date: d.ex_dividend_date, pay_date: d.payment_date && d.payment_date !== "None" ? d.payment_date : null, amount: toNum(d.amount) ?? 0 }))
      .filter((d) => d.ex_date && d.amount > 0)
      .sort((a, b) => b.ex_date.localeCompare(a.ex_date));
    const cutoff = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
    const ttm = history.filter((h) => h.ex_date >= cutoff).reduce((a, h) => a + h.amount, 0);
    return {
      ticker,
      kind: ["JEPQ", "LQD", "VNQ", "VOO"].includes(ticker.toUpperCase()) ? "distribution" : "dividend",
      history: history.slice(0, 40),
      trailing_12m: history.length ? ttm : null,
      meta: buildMeta({ timestamp: new Date().toISOString(), source: NAME, is_realtime: false }),
    };
  }

  async getFxRate(pair: "USDBRL"): Promise<FxRate> {
    const [rt, daily] = await Promise.all([
      this.call<AvBody>("CURRENCY_EXCHANGE_RATE", { from_currency: "USD", to_currency: "BRL" }, 60),
      this.call<AvBody>("FX_DAILY", { from_symbol: "USD", to_symbol: "BRL" }, 6 * 3600).catch(() => null),
    ]);
    const r = rt["Realtime Currency Exchange Rate"] as Record<string, string> | undefined;
    const rate = toNum(r?.["5. Exchange Rate"]);
    if (!r || rate === null) throw new ProviderUnavailableError(NAME, "fx", pair);
    const series = daily?.["Time Series FX (Daily)"] as Record<string, Record<string, string>> | undefined;
    let change1m: number | null = null;
    if (series) {
      const dates = Object.keys(series).sort().reverse();
      const monthAgo = dates[21];
      const past = monthAgo ? toNum(series[monthAgo]["4. close"]) : null;
      if (past) change1m = ((rate - past) / past) * 100;
    }
    const tz = r["7. Time Zone"] ?? "UTC";
    const ts = new Date(`${r["6. Last Refreshed"].replace(" ", "T")}${tz === "UTC" ? "Z" : ""}`).toISOString();
    return { pair, rate, timestamp: ts, source: NAME, is_realtime: false, change_1m: change1m };
  }

  async getMacro(): Promise<MacroIndicator[]> {
    const [ten, fed] = await Promise.all([
      this.call<AvBody>("TREASURY_YIELD", { interval: "daily", maturity: "10year" }, 6 * 3600).catch(() => null),
      this.call<AvBody>("FEDERAL_FUNDS_RATE", { interval: "daily" }, 12 * 3600).catch(() => null),
    ]);
    const out: MacroIndicator[] = [];
    const series = (b: AvBody | null) =>
      ((b?.data as { date: string; value: string }[] | undefined) ?? [])
        .map((d) => ({ date: d.date, value: toNum(d.value) }))
        .filter((d): d is { date: string; value: number } => d.value !== null);
    const build = (key: "US10Y" | "FEDFUNDS", label: string, s: { date: string; value: number }[]) => {
      if (!s.length) return;
      const [cur, prev] = s;
      const monthAgo = s[21] ?? s[s.length - 1];
      out.push({
        key, label, value: cur.value,
        change: prev ? cur.value - prev.value : null,
        change_pct: null,
        change_1m: monthAgo ? cur.value - monthAgo.value : null,
        unit: "percent", proxy: null,
        meta: buildMeta({ timestamp: etCloseIso(cur.date), source: NAME, is_realtime: false }),
      });
    };
    build("US10Y", "Treasury 10 anos", series(ten));
    build("FEDFUNDS", "Fed Funds (efetiva)", series(fed));
    if (!out.length) throw new ProviderUnavailableError(NAME, "macro");
    return out;
  }

  async getEtfProfile(ticker: string): Promise<EtfProfile> {
    const b = await this.call<AvBody>("ETF_PROFILE", { symbol: symbol(ticker) }, 24 * 3600, ticker);
    const holdings = ((b.holdings as Record<string, string>[] | undefined) ?? []).slice(0, 15).map((h) => ({
      symbol: h.symbol && h.symbol !== "n/a" ? h.symbol : null,
      name: h.description ?? h.symbol ?? "—",
      weight: (toNum(h.weight) ?? 0) * 100,
    }));
    const sectors = ((b.sectors as Record<string, string>[] | undefined) ?? []).map((s) => ({
      sector: s.sector, weight: (toNum(s.weight) ?? 0) * 100,
    }));
    return {
      ticker,
      net_assets: toNum(b.net_assets),
      expense_ratio: toNum(b.net_expense_ratio) !== null ? toNum(b.net_expense_ratio)! * 100 : null,
      dividend_yield: toNum(b.dividend_yield) !== null ? toNum(b.dividend_yield)! * 100 : null,
      turnover: toNum(b.portfolio_turnover) !== null ? toNum(b.portfolio_turnover)! * 100 : null,
      inception_date: (b.inception_date as string) ?? null,
      holdings,
      sectors,
      source: NAME,
      as_of: new Date().toISOString(),
    };
  }
}

/** 16:00 ET do dia informado, em ISO UTC (considera horário de verão). */
export function etCloseIso(day: string): string {
  // Descobre o offset de NY para a data (EDT -4 / EST -5).
  const probe = new Date(`${day}T20:00:00Z`);
  const nyHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hour12: false }).format(probe));
  const offset = 20 - nyHour; // 4 ou 5
  return new Date(`${day}T${String(16 + offset).padStart(2, "0")}:00:00Z`).toISOString();
}

function avTime(d: Date): string {
  const iso = d.toISOString();
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}`;
}

function parseAvTime(s: string): string {
  // 20260924T143000 (UTC? A AV documenta como horário do Leste; tratamos como ET)
  const y = s.slice(0, 4), m = s.slice(4, 6), d = s.slice(6, 8), hh = s.slice(9, 11), mm = s.slice(11, 13), ss = s.slice(13, 15) || "00";
  const probe = new Date(`${y}-${m}-${d}T12:00:00Z`);
  const nyHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hour12: false }).format(probe));
  const offset = 12 - nyHour;
  return new Date(Date.UTC(+y, +m - 1, +d, +hh + offset, +mm, +ss)).toISOString();
}

function mapAvNews(body: AvBody, ticker: string | null): NewsItem[] {
  const feed = (body.feed as Record<string, unknown>[] | undefined) ?? [];
  return feed.map((f, i) => {
    const ts = (f.ticker_sentiment as { ticker: string; relevance_score: string; ticker_sentiment_score: string }[] | undefined) ?? [];
    const mine = ticker ? ts.find((t) => t.ticker === symbol(ticker)) : undefined;
    return {
      id: `alphavantage-${String(f.url ?? i)}`,
      ticker,
      title: String(f.title ?? ""),
      summary: (f.summary as string) ?? null,
      url: (f.url as string) ?? null,
      source: String(f.source ?? "desconhecida"),
      provider: NAME,
      published_at: parseAvTime(String(f.time_published)),
      updated_at: null,
      provider_sentiment: mine ? toNum(mine.ticker_sentiment_score) : toNum(f.overall_sentiment_score),
      provider_relevance: mine ? toNum(mine.relevance_score) : null,
    };
  });
}
