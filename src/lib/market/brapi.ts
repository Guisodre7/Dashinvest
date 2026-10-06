import "server-only";
import { serverConfig } from "../config";
import { buildMeta } from "./freshness";
import { getJson, HttpError, toNum } from "./http";
import { memo } from "./memo";
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
export interface BrQuotes {
  quotes: Record<string, Quote | null>;
  /** Motivo por ativo quando não há cotação (exibido na tela, nunca escondido). */
  errors: Record<string, string>;
}

export async function getBrQuotes(codes: string[]): Promise<BrQuotes> {
  const token = serverConfig.brapiToken;
  const quotes: Record<string, Quote | null> = {};
  const errors: Record<string, string> = {};
  // Lotes de 2: o plano gratuito limita rajadas. Bloqueio do disjuntor é por ativo
  // (um ticker fora do plano não derruba os outros).
  for (let i = 0; i < codes.length; i += 2) {
    await Promise.all(codes.slice(i, i + 2).map(async (code) => {
      try {
        // Chave no header (recomendação da brapi), nunca na URL.
        // 10 min em memória (a cotação gratuita já é atrasada); sem cópia vencida do cache do Next.
        const body = await memo(`brapi:${code}`, 600_000, () => getJson<BrapiBody>(NAME, `quote:${code}`, `${BASE}/${encodeURIComponent(code)}`, {
          revalidate: 0, ticker: code, headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }));
        quotes[code] = parseBrapiQuote(code, body);
        if (!quotes[code]) errors[code] = body.message ? `brapi: ${body.message.slice(0, 80)}` : "resposta sem preço";
      } catch (err) {
        quotes[code] = null;
        errors[code] = err instanceof HttpError ? `HTTP ${err.status}${err.status === 401 || err.status === 403 ? " (token/plano)" : err.status === 429 ? " (limite)" : ""}` : "sem resposta";
      }
    }));
  }
  return { quotes, errors };
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
