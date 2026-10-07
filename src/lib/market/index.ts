import "server-only";
import { serverConfig } from "../config";
import type { MarketDataProvider } from "./provider";
import { AlphaVantageProvider } from "./providers/alphavantage";
import { BrazilFxProvider } from "./providers/brfx";
import { CompositeProvider } from "./providers/composite";
import { DemoProvider } from "./providers/demo";
import { FinnhubProvider } from "./providers/finnhub";
import { FredProvider } from "./providers/fred";
import { TiingoProvider } from "./providers/tiingo";

let cached: MarketDataProvider | null = null;

/**
 * Seleciona o fornecedor via MARKET_DATA_PROVIDER:
 *  - "composite" (padrão), tudo em planos gratuitos:
 *      Finnhub (cotações realtime, fundamentos, notícias, consenso, calendário)
 *      + Tiingo (histórico e proventos) + AwesomeAPI/Banco Central (câmbio)
 *      + FRED (juros EUA) + Alpha Vantage (revisões de estimativas, perfil de ETF;
 *      orçamento de 25/dia, ver alphavantage.ts)
 *  - "finnhub" | "alphavantage": fornecedor único
 *  - "demo": dados sintéticos, apenas fora de produção
 */
export function getMarketDataProvider(): MarketDataProvider {
  if (cached) return cached;
  const { marketDataProvider: kind, finnhubApiKey, finnhubPremium, alphaVantageApiKey, alphaVantageRealtime, tiingoApiKey } = serverConfig;

  if (kind === "demo") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("MARKET_DATA_PROVIDER=demo não é permitido em produção.");
    }
    cached = new DemoProvider();
    return cached;
  }

  const finnhub = finnhubApiKey ? new FinnhubProvider(finnhubApiKey, true, finnhubPremium) : null;
  const alpha = alphaVantageApiKey ? new AlphaVantageProvider(alphaVantageApiKey, alphaVantageRealtime) : null;

  const chain: (MarketDataProvider | null)[] =
    kind === "finnhub" ? [finnhub] :
    kind === "alphavantage" ? [alpha] :
    // Ordem = prioridade: a Alpha Vantage fica por último (reserva).
    [finnhub, tiingoApiKey ? new TiingoProvider(tiingoApiKey) : null, new BrazilFxProvider(), new FredProvider(), alpha];

  cached = new CompositeProvider(chain.filter((p): p is MarketDataProvider => p !== null));
  return cached;
}

export function isDemoProvider(): boolean {
  return serverConfig.marketDataProvider === "demo";
}
