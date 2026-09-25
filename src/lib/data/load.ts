import "server-only";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { cache } from "react";
import { analyzeAsset, type AssetAnalysis, type StrategyRow } from "../analysis/analyze";
import { deriveAlerts } from "../analysis/alerts";
import { computeMomentum, type Momentum } from "../analysis/indicators";
import { FOMC_2026, macroImpacts, regimeReadings, type MacroDriverImpact, type RegimeReading } from "../analysis/macro";
import { mergeSettings, type EngineSettings } from "../analysis/settings";
import type { SessionUser } from "../auth";
import { getRepo, getServiceRepo, type AlertRow, type Repo } from "../db/repo";
import { freshnessConfig } from "../freshness-config";
import { getMarketDataProvider, isDemoProvider } from "../market";
import { buildMeta, isOlderThan } from "../market/freshness";
import { getMarketStatus } from "../market/marketStatus";
import type { FxRate } from "../market/provider";
import type { MacroIndicator, MarketEvent, NewsItem, PriceHistory, Quote } from "../market/types";
import { computePortfolio, type DividendRow, type PortfolioSummary, type PositionRow } from "../portfolio/calc";
import { assetMeta } from "../portfolio/defaults";

export interface LoadedContext {
  user: SessionUser;
  repo: Repo;
  settings: EngineSettings;
  strategy: StrategyRow[];
  portfolio: PortfolioSummary;
  /** Dados brutos para recalcular o patrimônio no navegador com os preços ao vivo. */
  positions: PositionRow[];
  dividends: DividendRow[];
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

// ---------------------------------------------------------------------------
// Cache curto em memória (por instância do servidor), só para TROCA DE ABA:
// a última análise aparece na hora e uma nova é calculada em segundo plano.
// - Abrir o app / recarregar a página (nova sessão) nunca usa análise com
//   mais de 30s: vem tudo recalculado.
// - Qualquer gravação muda o cookie de versão dos dados, que faz parte da
//   chave: nenhuma instância serve posições anteriores a uma compra.
// - Patrimônio e preços seguem ao vivo no navegador (LiveQuotes).
// ---------------------------------------------------------------------------
const FRESH_MS = 30_000; // até 30s: usa direto
const STALE_MS = 10 * 60_000; // troca de aba: até 10 min mostra na hora e recalcula em segundo plano
const DATA_VERSION_COOKIE = "dv";
type CacheEntry = { at: number; data: Promise<Omit<LoadedContext, "repo">>; settled: boolean; refreshing: boolean };
const contextCache = new Map<string, CacheEntry>();

/** Chamar em toda server action que grava dados do usuário. */
export async function invalidateUserContext(userId: string) {
  for (const key of contextCache.keys()) if (key.startsWith(`${userId}|`)) contextCache.delete(key);
  try {
    (await cookies()).set(DATA_VERSION_COOKIE, Date.now().toString(36), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 400 * 86_400 });
  } catch { /* fora de server action: só a invalidação local */ }
}

function store(key: string, data: Promise<Omit<LoadedContext, "repo">>) {
  const entry: CacheEntry = { at: Date.now(), data, settled: false, refreshing: false };
  contextCache.set(key, entry);
  data.then(() => { entry.settled = true; }, () => { if (contextCache.get(key) === entry) contextCache.delete(key); });
  if (contextCache.size > 50) contextCache.delete(contextCache.keys().next().value!);
  return entry;
}

/** Navegação dentro do app (RSC) × carregamento completo da página. */
async function isClientNavigation() {
  try { return (await headers()).get("rsc") === "1"; } catch { return false; }
}

/**
 * Carrega e analisa a carteira inteira. Deduplicado por request (React cache).
 * Na troca de aba usa "stale-while-revalidate" (ver acima); ao abrir o app,
 * sempre dados atuais.
 */
export const loadContext = cache(async (user: SessionUser, opts: { tickers?: string[]; repo?: Repo; fresh?: boolean } = {}): Promise<LoadedContext> => {
  const repo = opts.repo ?? (await getRepo(user.id));
  // O repositório é por request (cookies da sessão) — nunca entra no cache.
  if (opts.repo || opts.fresh) return { ...(await computeContext(user, repo, opts.tickers)), repo };
  const version = await cookies().then((c) => c.get(DATA_VERSION_COOKIE)?.value ?? "0", () => "0");
  const key = `${user.id}|${version}|${(opts.tickers ?? []).join(",")}`;
  const hit = contextCache.get(key);
  const age = hit ? Date.now() - hit.at : Infinity;

  if (hit && (age < FRESH_MS || !hit.settled)) {
    try { return { ...(await hit.data), repo }; } catch { /* recalcula abaixo */ }
  } else if (hit && hit.settled && age < STALE_MS && (await isClientNavigation())) {
    if (!hit.refreshing) {
      hit.refreshing = true;
      // Recalcula depois de responder, com acesso de serviço limitado a este usuário.
      after(async () => {
        const bg = getServiceRepo(user.id);
        if (!bg) { hit.refreshing = false; return; }
        const next = store(key, computeContext(user, bg, opts.tickers));
        await next.data.catch(() => undefined);
      });
    }
    return { ...(await hit.data), repo };
  }
  const entry = store(key, computeContext(user, repo, opts.tickers));
  return { ...(await entry.data), repo };
});

async function computeContext(user: SessionUser, repo: Repo, tickersOpt?: string[]): Promise<Omit<LoadedContext, "repo">> {
  const provider = getMarketDataProvider();
  const errors: string[] = [];
  const now = new Date();

  const [strategy, positions, dividends, settings, cashBalance, storedAlerts] = await Promise.all([
    repo.getStrategy(), repo.getPositions(), repo.getDividends(), loadSettings(repo),
    repo.getSetting<number>("opportunity_cash_balance"), repo.getAlerts(40).catch(() => []),
  ]);
  const allTickers = [...new Set([...strategy.map((s) => s.ticker), ...positions.map((p) => p.ticker)])];
  const tickers = tickersOpt ?? allTickers;

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
    user, settings, strategy, portfolio, positions, dividends, analyses, quotes, fx, fxStale, macro, regime,
    impacts: macroImpacts(regime), marketNews: (marketNews ?? []).slice(0, 20), macroEvents, alerts,
    providerName: provider.name, isDemo: isDemoProvider(), errors,
    opportunityCashBalance: typeof cashBalance === "number" ? cashBalance : 0,
    loadedAt: now.toISOString(),
  };
}

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
