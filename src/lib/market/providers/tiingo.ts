import "server-only";
import { buildMeta } from "../freshness";
import { getJson, toNum } from "../http";
import type { Capability } from "../provider";
import { ProviderUnavailableError, type DailyBar, type DividendInfo, type PriceHistory } from "../types";
import { etCloseIso } from "./alphavantage";
import { PartialProvider } from "./base";

const NAME = "tiingo";
const BASE = "https://api.tiingo.com/tiingo/daily";
const YEARS = 5;
// Tiingo usa hífen para classes de ações (BRK-B).
const symbol = (t: string) => t.toLowerCase().replace(".", "-");

export interface TiingoRow {
  date: string; open: number; high: number; low: number; close: number; volume: number;
  adjOpen?: number; adjHigh?: number; adjLow?: number; adjClose?: number; adjVolume?: number;
  divCash?: number; splitFactor?: number;
}

/**
 * Tiingo (plano gratuito: ~1.000 requisições/dia) — histórico diário ajustado
 * por proventos e desdobramentos, e o histórico de proventos (divCash) da
 * mesma resposta. Uma consulta por ativo a cada 6h, compartilhada no cache.
 */
export class TiingoProvider extends PartialProvider {
  readonly name = NAME;
  readonly capabilities: ReadonlySet<Capability> = new Set<Capability>(["history", "dividends"]);

  constructor(private apiKey: string) { super(); }

  private rows(ticker: string) {
    const start = new Date(Date.now() - YEARS * 365 * 86_400_000).toISOString().slice(0, 10);
    const q = new URLSearchParams({ startDate: start, token: this.apiKey });
    return getJson<TiingoRow[]>(NAME, "daily/prices", `${BASE}/${symbol(ticker)}/prices?${q}`, { revalidate: 6 * 3600, ticker, timeoutMs: 8_000 });
  }

  async getDailyHistory(ticker: string): Promise<PriceHistory> {
    return parseTiingoHistory(ticker, await this.rows(ticker));
  }

  async getDividends(ticker: string): Promise<DividendInfo> {
    return parseTiingoDividends(ticker, await this.rows(ticker));
  }
}

export function parseTiingoHistory(ticker: string, rows: TiingoRow[]): PriceHistory {
  const bars: DailyBar[] = (Array.isArray(rows) ? rows : [])
    .map((r) => {
      const adj = toNum(r.adjClose) !== null;
      return {
        time: String(r.date).slice(0, 10),
        open: toNum(adj ? r.adjOpen : r.open)!,
        high: toNum(adj ? r.adjHigh : r.high)!,
        low: toNum(adj ? r.adjLow : r.low)!,
        close: toNum(adj ? r.adjClose : r.close)!,
        volume: toNum(r.volume) ?? 0,
      };
    })
    .filter((b) => Number.isFinite(b.close) && b.close > 0 && /^\d{4}-\d{2}-\d{2}$/.test(b.time))
    .sort((a, b) => a.time.localeCompare(b.time));
  if (!bars.length) throw new ProviderUnavailableError(NAME, "history", ticker);
  const last = bars[bars.length - 1];
  return {
    ticker, bars, adjusted: rows.some((r) => toNum(r.adjClose) !== null),
    meta: buildMeta({ timestamp: etCloseIso(last.time), source: NAME, is_realtime: false }),
  };
}

export function parseTiingoDividends(ticker: string, rows: TiingoRow[], now = new Date()): DividendInfo {
  if (!Array.isArray(rows) || !rows.length) throw new ProviderUnavailableError(NAME, "dividends", ticker);
  const history = rows
    .filter((r) => (toNum(r.divCash) ?? 0) > 0)
    .map((r) => ({ ex_date: String(r.date).slice(0, 10), pay_date: null, amount: toNum(r.divCash)! }))
    .sort((a, b) => b.ex_date.localeCompare(a.ex_date));
  const cutoff = new Date(now.getTime() - 365 * 86_400_000).toISOString().slice(0, 10);
  const ttm = history.filter((h) => h.ex_date >= cutoff).reduce((a, h) => a + h.amount, 0);
  return {
    ticker,
    kind: ["JEPQ", "LQD", "VNQ", "VOO"].includes(ticker.toUpperCase()) ? "distribution" : "dividend",
    history: history.slice(0, 40),
    trailing_12m: history.length ? ttm : null,
    meta: buildMeta({ timestamp: etCloseIso(String(rows[rows.length - 1].date).slice(0, 10)), source: NAME, is_realtime: false }),
  };
}
