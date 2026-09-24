import "server-only";
import type { Capability, EtfProfile, FxRate, MarketDataProvider } from "../provider";
import {
  ProviderUnavailableError,
  type AnalystData, type DividendInfo, type EarningsEstimates, type Fundamentals,
  type MacroIndicator, type MarketEvent, type NewsItem, type PriceHistory, type Quote,
} from "../types";

/**
 * Encadeia fornecedores por prioridade. Para cotação usa o primeiro que
 * responder (o mais rápido/realtime primeiro). Para fundamentos, analistas
 * e estimativas combina fontes: campos nulos do primário são completados
 * pelo secundário e o `source` passa a listar todas as fontes usadas.
 */
export class CompositeProvider implements MarketDataProvider {
  readonly name: string;
  readonly capabilities: ReadonlySet<Capability>;

  constructor(private providers: MarketDataProvider[]) {
    this.name = providers.map((p) => p.name).join("+");
    this.capabilities = new Set(providers.flatMap((p) => [...p.capabilities]));
  }

  private supporting(cap: Capability) {
    return this.providers.filter((p) => p.capabilities.has(cap));
  }

  private async first<T>(cap: Capability, fn: (p: MarketDataProvider) => Promise<T>): Promise<T> {
    const errors: string[] = [];
    for (const p of this.supporting(cap)) {
      try {
        return await fn(p);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    throw new ProviderUnavailableError(this.name, cap, errors.join(" | ") || "nenhum fornecedor configurado");
  }

  private async all<T>(cap: Capability, fn: (p: MarketDataProvider) => Promise<T>): Promise<T[]> {
    const results = await Promise.allSettled(this.supporting(cap).map(fn));
    const ok = results.filter((r): r is PromiseFulfilledResult<Awaited<T>> => r.status === "fulfilled").map((r) => r.value);
    if (!ok.length) {
      const reasons = results.map((r) => (r.status === "rejected" ? String((r.reason as Error)?.message ?? r.reason) : "")).filter(Boolean);
      throw new ProviderUnavailableError(this.name, cap, reasons.join(" | ") || "nenhum fornecedor configurado");
    }
    return ok;
  }

  getQuote(ticker: string): Promise<Quote> {
    return this.first("quote", (p) => p.getQuote(ticker));
  }

  getDailyHistory(ticker: string): Promise<PriceHistory> {
    return this.first("history", (p) => p.getDailyHistory(ticker));
  }

  async getFundamentals(ticker: string): Promise<Fundamentals> {
    return mergeRecords(await this.all("fundamentals", (p) => p.getFundamentals(ticker)));
  }

  async getEarningsEstimates(ticker: string): Promise<EarningsEstimates> {
    const list = await this.all("estimates", (p) => p.getEarningsEstimates(ticker));
    // Prefere a fonte com mais períodos (e com revisões 30/90d); surpresas da que tiver.
    const withPeriods = [...list].sort((a, b) => score(b) - score(a));
    const base = withPeriods[0];
    const surprises = list.find((l) => l.surprises.length)?.surprises ?? [];
    return { ...base, surprises, meta: { ...base.meta, source: list.map((l) => l.meta.source).join("+") } };
    function score(e: EarningsEstimates) {
      return e.periods.length * 10 + e.periods.filter((p) => p.eps_revision_30d_pct !== null).length;
    }
  }

  async getAnalystData(ticker: string): Promise<AnalystData> {
    const list = await this.all("analysts", (p) => p.getAnalystData(ticker));
    // Série de recomendações: a mais longa (permite ver mudanças no tempo).
    const recs = [...list].sort((a, b) => b.recommendations.length - a.recommendations.length)[0].recommendations;
    const merged = mergeRecords(list);
    return { ...merged, recommendations: recs };
  }

  async getNews(ticker: string, days: number): Promise<NewsItem[]> {
    return dedupeNews((await this.all("news", (p) => p.getNews(ticker, days))).flat());
  }

  async getMarketNews(): Promise<NewsItem[]> {
    return dedupeNews((await this.all("marketNews", (p) => p.getMarketNews())).flat());
  }

  async getEvents(tickers: string[], fromDate: string, toDate: string): Promise<MarketEvent[]> {
    return (await this.all("events", (p) => p.getEvents(tickers, fromDate, toDate))).flat();
  }

  getDividends(ticker: string): Promise<DividendInfo> {
    return this.first("dividends", (p) => p.getDividends(ticker));
  }

  getFxRate(pair: "USDBRL"): Promise<FxRate> {
    return this.first("fx", (p) => p.getFxRate(pair));
  }

  async getMacro(): Promise<MacroIndicator[]> {
    const seen = new Set<string>();
    return (await this.all("macro", (p) => p.getMacro())).flat().filter((m) => !seen.has(m.key) && seen.add(m.key));
  }

  getEtfProfile(ticker: string): Promise<EtfProfile> {
    return this.first("etfProfile", (p) => p.getEtfProfile(ticker));
  }
}

/** Completa campos nulos do primeiro registro com os seguintes. */
export function mergeRecords<T extends { meta: { source: string } }>(list: T[]): T {
  const [head, ...rest] = list;
  const out = { ...head } as Record<string, unknown>;
  for (const other of rest) {
    for (const [k, v] of Object.entries(other)) {
      if (k === "meta") continue;
      if ((out[k] === null || out[k] === undefined) && v !== null && v !== undefined) out[k] = v;
    }
  }
  out.meta = { ...head.meta, source: [...new Set(list.map((l) => l.meta.source))].join("+") };
  return out as T;
}

function dedupeNews(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  return items
    .sort((a, b) => b.published_at.localeCompare(a.published_at))
    .filter((n) => {
      const key = n.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 80);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
