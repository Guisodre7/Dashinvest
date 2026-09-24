import "server-only";
import { serverConfig } from "../config";
import type { MarketDataProvider } from "./provider";
import { AlphaVantageProvider } from "./providers/alphavantage";
import { CompositeProvider } from "./providers/composite";
import { DemoProvider } from "./providers/demo";
import { FinnhubProvider } from "./providers/finnhub";

let cached: MarketDataProvider | null = null;

/**
 * Seleciona o fornecedor via MARKET_DATA_PROVIDER:
 *  - "composite" (padrão): Finnhub (cotações realtime) + Alpha Vantage (histórico, estimativas, macro)
 *  - "finnhub" | "alphavantage": fornecedor único
 *  - "demo": dados sintéticos, apenas fora de produção
 */
export function getMarketDataProvider(): MarketDataProvider {
  if (cached) return cached;
  const { marketDataProvider: kind, finnhubApiKey, alphaVantageApiKey, alphaVantageRealtime } = serverConfig;

  if (kind === "demo") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("MARKET_DATA_PROVIDER=demo não é permitido em produção.");
    }
    cached = new DemoProvider();
    return cached;
  }

  const finnhub = finnhubApiKey ? new FinnhubProvider(finnhubApiKey, true) : null;
  const alpha = alphaVantageApiKey ? new AlphaVantageProvider(alphaVantageApiKey, alphaVantageRealtime) : null;

  const chain: (MarketDataProvider | null)[] =
    kind === "finnhub" ? [finnhub] :
    kind === "alphavantage" ? [alpha] :
    [finnhub, alpha];

  cached = new CompositeProvider(chain.filter((p): p is MarketDataProvider => p !== null));
  return cached;
}

export function isDemoProvider(): boolean {
  return serverConfig.marketDataProvider === "demo";
}
