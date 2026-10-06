import "server-only";
import { serverConfig } from "../config";
import { buildMeta } from "./freshness";
import { getJson, toNum } from "./http";
import type { Quote } from "./types";

const BASE = "https://brapi.dev/api/quote";
const NAME = "brapi";

export type BrapiBody = { results?: Record<string, unknown>[]; error?: boolean; message?: string };

/**
 * Cotações da B3 pela brapi.dev (plano gratuito: 1 ativo por requisição;
 * PETR4, VALE3, ITUB4 e MGLU3 funcionam sem token). Cotação atrasada —
 * nunca rotulada como tempo real; o horário exibido é o do fornecedor.
 * 15 min de cache compartilhado por ativo.
 */
export async function getBrQuotes(codes: string[]): Promise<Record<string, Quote | null>> {
  const token = serverConfig.brapiToken;
  const out = await Promise.all(codes.map(async (code) => {
    // Chave no header (recomendação da brapi), nunca na URL.
    const body = await getJson<BrapiBody>(NAME, "quote", `${BASE}/${encodeURIComponent(code)}`, {
      revalidate: 900, ticker: code, headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    }).catch(() => null);
    return [code, body ? parseBrapiQuote(code, body) : null] as const;
  }));
  return Object.fromEntries(out);
}

export function parseBrapiQuote(code: string, body: BrapiBody): Quote | null {
  const r = body.results?.find((x) => String(x.symbol ?? "").toUpperCase() === code) ?? body.results?.[0];
  const price = toNum(r?.regularMarketPrice);
  const time = r?.regularMarketTime ? new Date(String(r.regularMarketTime)) : null;
  if (!r || price === null || !time || Number.isNaN(time.getTime())) return null;
  return {
    ticker: code,
    name: (r.longName as string) ?? (r.shortName as string) ?? null,
    price, bid: null, ask: null, spread: null,
    change: toNum(r.regularMarketChange),
    change_pct: toNum(r.regularMarketChangePercent),
    open: toNum(r.regularMarketOpen), high: toNum(r.regularMarketDayHigh), low: toNum(r.regularMarketDayLow),
    prev_close: toNum(r.regularMarketPreviousClose), volume: toNum(r.regularMarketVolume), avg_volume: null,
    week52_high: toNum(r.fiftyTwoWeekHigh), week52_low: toNum(r.fiftyTwoWeekLow),
    session: "REGULAR",
    meta: buildMeta({ timestamp: time.toISOString(), source: NAME, is_realtime: false }),
  };
}
