import "server-only";
import { cache } from "react";
import { analyzeAsset, type AssetAnalysis, type StrategyRow } from "../analysis/analyze";
import { deriveAlerts } from "../analysis/alerts";
import { computeMomentum, type Momentum } from "../analysis/indicators";
import { FOMC_2026, macroImpacts, regimeReadings, type MacroDriverImpact, type RegimeReading } from "../analysis/macro";
import { mergeSettings, type EngineSettings } from "../analysis/settings";
import type { SessionUser } from "../auth";
import { getRepo, type AlertRow, type Repo } from "../db/repo";
import { freshnessConfig } from "../freshness-config";
import { getMarketDataProvider, isDemoProvider } from "../market";
import { buildMeta, isOlderThan } from "../market/freshness";
import { getMarketStatus } from "../market/marketStatus";
import type { FxRate } from "../market/provider";
import type { MacroIndicator, MarketEvent, NewsItem, PriceHistory, Quote } from "../market/types";
import { computePortfolio, type PortfolioSummary } from "../portfolio/calc";
import { assetMeta } from "../portfolio/defaults";

export interface LoadedContext {
  user: SessionUser;
  repo: Repo;
  settings: EngineSettings;
  strategy: StrategyRow[];
  portfolio: PortfolioSummary;
  analyses: AssetAnalysis[];
  quotes: Record<string, Quote | null>;
  fx: FxRate | null;
  fxStale: boolean;
  macro: MacroIndicator[];
  regime: RegimeReading[];
  impacts: MacroDriverImpact[];
  marketNews: NewsItem[];
  macroEvents: MarketEvent[];
  alerts: AlertRow[];
  providerName: string;
  isDemo: boolean;
  errors: string[];
  opportunityCashBalance: number;
  loadedAt: string;
}

async function safe<T>(label: string, errors: string[], fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export async function loadSettings(repo: Repo): Promise<EngineSettings> {
  return mergeSettings(await repo.getSetting<Partial<EngineSettings>>("engine"));
}

/** Carrega e analisa a carteira inteira. Deduplicado por request via React cache. */
export const loadContext = cache(async (user: SessionUser, opts: { tickers?: string[]; repo?: Repo } = {}): Promise<LoadedContext> => {
  const provider = getMarketDataProvider();
  const repo = opts.repo ?? (await getRepo(user.id));
  const errors: string[] = [];
  const now = new Date();

  const [strategy, positions, dividends, settings, cashBalance, storedAlerts] = await Promise.all([
    repo.getStrategy(), repo.getPositions(), repo.getDividends(), loadSettings(repo),
    repo.getSetting<number>("opportunity_cash_balance"), repo.getAlerts(40).catch(() => []),
  ]);
  const allTickers = [...new Set([...strategy.map((s) => s.ticker), ...positions.map((p) => p.ticker)])];
  const tickers = opts.tickers ?? allTickers;

  const from = now.toISOString().slice(0, 10);
  const to = new Date(now.getTime() + 60 * 86_400_000).toISOString().slice(0, 10);

  const [fx, macroRaw, spyHistory, macroQuotes, marketNews, events] = await Promise.all([
    safe("Câmbio USD/BRL", errors, () => provider.getFxRate("USDBRL")),
    safe("Macro (juros)", errors, () => provider.getMacro()),
    safe("Histórico SPY", errors, () => provider.getDailyHistory("SPY")),
    Promise.all((["SPY", "QQQ", "DIA", "UUP"] as const).map((t) => safe(`Cotação ${t}`, errors, () => provider.getQuote(t)))),
    safe("Notícias de mercado", errors, () => provider.getMarketNews()),
    safe("Calendário de earnings", errors, () => provider.getEvents(allTickers, from, to)),
  ]);

  const perTicker = await Promise.all(allTickers.map(async (ticker) => {
    const meta = assetMeta(ticker);
    const tErr: string[] = [];
    const deep = tickers.includes(ticker);
    const [quote, history, fundamentals, estimates, analysts, news, estimateHistory] = await Promise.all([
      safe(`${ticker} cotação`, tErr, () => provider.getQuote(ticker)),
      deep ? safe(`${ticker} histórico`, tErr, () => provider.getDailyHistory(ticker)) : null,
      deep && !meta.isEtf ? safe(`${ticker} fundamentos`, tErr, () => provider.getFundamentals(ticker)) : null,
      deep && !meta.isEtf ? safe(`${ticker} estimativas`, tErr, () => provider.getEarningsEstimates(ticker)) : null,
      deep && !meta.isEtf ? safe(`${ticker} analistas`, tErr, () => provider.getAnalystData(ticker)) : null,
      deep ? safe(`${ticker} notícias`, tErr, () => provider.getNews(ticker, 7)) : null,
      deep && !meta.isEtf ? repo.getEstimateHistory(ticker).catch(() => []) : [],
    ]);
    // Guarda histórico de estimativas (1 registro por dia) para detectar revisões.
    if (estimates) void repo.saveEstimates(estimates).catch(() => undefined);
    if (analysts) void repo.saveAnalystSnapshot(analysts).catch(() => undefined);
    errors.push(...tErr);
    return { ticker, meta, quote, history, fundamentals, estimates, analysts, news: news ?? [], estimateHistory, errors: tErr };
  }));

  const quotes: Record<string, Quote | null> = Object.fromEntries(perTicker.map((p) => [p.ticker, p.quote]));
  const prices: Record<string, number | null> = Object.fromEntries(perTicker.map((p) => [
    p.ticker, p.quote?.price ?? p.history?.bars[p.history.bars.length - 1]?.close ?? null,
  ]));

  const fxStale = !fx || isOlderThan(fx.timestamp, freshnessConfig.maxFxAgeSec, now);
  const portfolio = computePortfolio(positions, prices, strategy, dividends, fx?.rate ?? null);

  const spyMomentum: Momentum | null = spyHistory && spyHistory.bars.length > 30 ? computeMomentum(spyHistory.bars, macroQuotes[0]?.price) : null;
  const macro = buildMacro(macroRaw ?? [], macroQuotes, fx, spyMomentum);
  const regime = regimeReadings(macro, spyMomentum);

  const targetSum = strategy.filter((s) => s.enabled && !s.is_legacy).reduce((a, s) => a + s.target_weight, 0) || 100;
  const posView = new Map(portfolio.positions.map((p) => [p.ticker, p]));
  const allEvents = events ?? [];

  const analyses = perTicker
    .filter((p) => tickers.includes(p.ticker))
    .map((p) => {
      const s = strategy.find((x) => x.ticker === p.ticker) ?? {
        ticker: p.ticker, target_weight: 0, min_weight: null, max_weight: null, enabled: false, accepts_contributions: false,
        is_legacy: false, legacy_label: null, priority: 99, strategy_bucket: "FORA DA ESTRATÉGIA",
      };
      const view = posView.get(p.ticker);
      return analyzeAsset({
        ticker: p.ticker,
        name: p.fundamentals?.name ?? p.quote?.name ?? p.meta.name,
        isEtf: p.meta.isEtf,
        strategy: s,
        quote: p.quote,
        history: p.history as PriceHistory | null,
        fundamentals: p.fundamentals,
        estimates: p.estimates,
        estimateHistory: p.estimateHistory,
        analysts: p.analysts,
        news: p.news,
        events: allEvents.filter((e) => e.ticker === p.ticker),
        currentWeight: s.is_legacy ? view?.weightTotal ?? 0 : view?.weightStrategic ?? 0,
        targetWeight: s.enabled && !s.is_legacy ? (s.target_weight / targetSum) * 100 : 0,
        benchmarkDd1m: spyMomentum?.ret_1m ?? null,
        errors: p.errors,
      }, settings, now);
    });

  const derived = deriveAlerts(analyses, now);
  void repo.upsertAlerts(derived).catch(() => undefined);
  const alerts = mergeAlerts(derived, storedAlerts);

  const macroEvents: MarketEvent[] = FOMC_2026.filter((d) => d >= from).slice(0, 2).map((d) => ({
    ticker: null, kind: "fomc", title: "Decisão de juros do FOMC", date: d, time: "14:00 ET",
    source: "federalreserve.gov (calendário publicado)", details: {},
  }));

  return {
    user, repo, settings, strategy, portfolio, analyses, quotes, fx, fxStale, macro, regime,
    impacts: macroImpacts(regime), marketNews: (marketNews ?? []).slice(0, 20), macroEvents, alerts,
    providerName: provider.name, isDemo: isDemoProvider(), errors,
    opportunityCashBalance: typeof cashBalance === "number" ? cashBalance : 0,
    loadedAt: now.toISOString(),
  };
});

function mergeAlerts(derived: AlertRow[], stored: AlertRow[]): AlertRow[] {
  const keys = new Set(derived.map((d) => d.dedupe_key));
  const sev = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  return [...derived, ...stored.filter((s) => !keys.has(s.dedupe_key) && !s.read_at)]
    .sort((a, b) => sev[a.severity] - sev[b.severity])
    .slice(0, 30);
}

function buildMacro(rates: MacroIndicator[], quotes: (Quote | null)[], fx: FxRate | null, spy: Momentum | null): MacroIndicator[] {
  const [spyQ, qqq, dia, uup] = quotes;
  const fromQuote = (key: MacroIndicator["key"], label: string, q: Quote | null, proxy: string, change1m: number | null = null): MacroIndicator => ({
    key, label, value: q?.price ?? null, change: q?.change ?? null, change_pct: q?.change_pct ?? null,
    change_1m: change1m, unit: "points", proxy, meta: q?.meta ?? null,
  });
  const out: MacroIndicator[] = [
    fromQuote("SPX", "S&P 500", spyQ, "SPY", spy?.ret_1m ?? null),
    fromQuote("NDX", "Nasdaq-100", qqq, "QQQ"),
    fromQuote("DJI", "Dow Jones", dia, "DIA"),
    { key: "VIX", label: "VIX", value: null, change: null, change_pct: null, change_1m: null, unit: "points", proxy: null, meta: null },
    ...rates,
    fromQuote("DXY", "Índice do dólar", uup, "UUP"),
  ];
  if (fx) {
    out.push({
      key: "USDBRL", label: "USD/BRL", value: fx.rate, change: null, change_pct: null, change_1m: fx.change_1m, unit: "rate", proxy: null,
      meta: buildMeta({ timestamp: fx.timestamp, source: fx.source, is_realtime: fx.is_realtime }),
    });
  } else {
    out.push({ key: "USDBRL", label: "USD/BRL", value: null, change: null, change_pct: null, change_1m: null, unit: "rate", proxy: null, meta: null });
  }
  for (const k of ["US10Y", "FEDFUNDS"] as const) {
    if (!out.some((m) => m.key === k)) out.push({ key: k, label: k === "US10Y" ? "Treasury 10 anos" : "Fed Funds", value: null, change: null, change_pct: null, change_1m: null, unit: "percent", proxy: null, meta: null });
  }
  return out;
}

export function marketStatusNow() {
  return getMarketStatus(new Date());
}
