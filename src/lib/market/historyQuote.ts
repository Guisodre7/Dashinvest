import type { PriceHistory, Quote } from "./types";

/**
 * Reserva quando a cotação ao vivo falha (limite do plano gratuito, fornecedor fora do ar):
 * o último FECHAMENTO do histórico diário, com o horário real desse fechamento. Não é tempo
 * real e a tela mostra a idade; para decisão de longo prazo (até MAX_DECISION_AGE) basta.
 */
export function quoteFromHistory(ticker: string, h: PriceHistory | null | undefined): Quote | null {
  const bars = h?.bars ?? [];
  const last = bars[bars.length - 1], prev = bars[bars.length - 2];
  if (!h || !last || !(last.close > 0)) return null;
  const change = prev ? last.close - prev.close : null;
  return {
    ticker, name: null, price: last.close, bid: null, ask: null, spread: null,
    change, change_pct: prev && change !== null ? (change / prev.close) * 100 : null,
    open: last.open, high: last.high, low: last.low, prev_close: prev?.close ?? null,
    volume: last.volume || null, avg_volume: null, week52_high: null, week52_low: null,
    session: "REGULAR",
    meta: { ...h.meta, source: `${h.meta.source} (fechamento de ${last.time})`, is_realtime: false, is_delayed: true },
  };
}
