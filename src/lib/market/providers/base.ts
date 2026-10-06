import type { Capability, EtfProfile, FxRate, MarketDataProvider } from "../provider";
import {
  ProviderUnavailableError,
  type AnalystData, type DividendInfo, type EarningsEstimates, type Fundamentals,
  type MacroIndicator, type MarketEvent, type NewsItem, type PriceHistory, type Quote,
} from "../types";

/**
 * Base para fornecedores que cobrem só parte da interface: tudo o que não for
 * sobrescrito responde "indisponível" (o CompositeProvider só chama o que
 * estiver em `capabilities`).
 */
export abstract class PartialProvider implements MarketDataProvider {
  abstract readonly name: string;
  abstract readonly capabilities: ReadonlySet<Capability>;

  protected unavailable(what: string): never {
    throw new ProviderUnavailableError(this.name, what);
  }

  async getQuote(_ticker: string): Promise<Quote> { this.unavailable("quote"); }
  async getDailyHistory(_ticker: string): Promise<PriceHistory> { this.unavailable("history"); }
  async getFundamentals(_ticker: string): Promise<Fundamentals> { this.unavailable("fundamentals"); }
  async getEarningsEstimates(_ticker: string): Promise<EarningsEstimates> { this.unavailable("estimates"); }
  async getAnalystData(_ticker: string): Promise<AnalystData> { this.unavailable("analysts"); }
  async getNews(_ticker: string, _days: number): Promise<NewsItem[]> { this.unavailable("news"); }
  async getMarketNews(): Promise<NewsItem[]> { this.unavailable("marketNews"); }
  async getEvents(_tickers: string[], _from: string, _to: string): Promise<MarketEvent[]> { this.unavailable("events"); }
  async getDividends(_ticker: string): Promise<DividendInfo> { this.unavailable("dividends"); }
  async getFxRate(_pair: "USDBRL"): Promise<FxRate> { this.unavailable("fx"); }
  async getMacro(): Promise<MacroIndicator[]> { this.unavailable("macro"); }
  async getEtfProfile(_ticker: string): Promise<EtfProfile> { this.unavailable("etfProfile"); }
}
