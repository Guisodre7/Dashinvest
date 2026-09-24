function num(name: string, fallback: number): number {
  const raw = typeof process !== "undefined" ? process.env[name] : undefined;
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Limites de validade dos dados (segundos). Configuráveis por env.
 * - MAX_MARKET_DATA_AGE: idade máxima de cotação com mercado aberto para
 *   permitir recomendações baseadas no preço atual (ideal <= 30s).
 * - MAX_MARKET_DATA_AGE_CLOSED: com mercado fechado vale o último fechamento;
 *   o limite apenas garante que não estamos olhando um pregão antigo.
 */
export const freshnessConfig = {
  maxMarketDataAgeSec: num("MAX_MARKET_DATA_AGE", 30),
  warnMarketDataAgeSec: num("WARN_MARKET_DATA_AGE", 15),
  maxMarketDataAgeClosedSec: num("MAX_MARKET_DATA_AGE_CLOSED", 60 * 60 * 100),
  maxFundamentalsAgeSec: num("MAX_FUNDAMENTALS_AGE", 60 * 60 * 24 * 10),
  maxEstimatesAgeSec: num("MAX_ESTIMATES_AGE", 60 * 60 * 24 * 10),
  maxNewsAgeSec: num("MAX_NEWS_AGE", 60 * 60 * 72),
  maxFxAgeSec: num("MAX_FX_AGE", 60 * 60 * 24),
};
