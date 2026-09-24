import type {
  AnalystData, DividendInfo, EarningsEstimates, Fundamentals, MacroIndicator,
  MarketEvent, NewsItem, PriceHistory, Quote,
} from "./types";

export type Capability =
  | "quote" | "history" | "fundamentals" | "estimates" | "analysts"
  | "news" | "marketNews" | "events" | "dividends" | "fx" | "macro" | "etfProfile";

export interface EtfProfile {
  ticker: string;
  net_assets: number | null;
  expense_ratio: number | null;
  dividend_yield: number | null;
  turnover: number | null;
  inception_date: string | null;
  holdings: { symbol: string | null; name: string; weight: number }[];
  sectors: { sector: string; weight: number }[];
  source: string;
  as_of: string;
}

export interface FxRate {
  pair: "USDBRL";
  rate: number;
  timestamp: string;
  source: string;
  is_realtime: boolean;
  change_1m: number | null;
}

/**
 * Abstração de fornecedor de dados de mercado. A aplicação depende apenas
 * desta interface — trocar de fornecedor não exige mudanças nas análises.
 * Métodos não suportados lançam ProviderUnavailableError.
 */
export interface MarketDataProvider {
  readonly name: string;
  readonly capabilities: ReadonlySet<Capability>;

  getQuote(ticker: string): Promise<Quote>;
  getDailyHistory(ticker: string): Promise<PriceHistory>;
  getFundamentals(ticker: string): Promise<Fundamentals>;
  getEarningsEstimates(ticker: string): Promise<EarningsEstimates>;
  getAnalystData(ticker: string): Promise<AnalystData>;
  getNews(ticker: string, days: number): Promise<NewsItem[]>;
  getMarketNews(): Promise<NewsItem[]>;
  getEvents(tickers: string[], fromDate: string, toDate: string): Promise<MarketEvent[]>;
  getDividends(ticker: string): Promise<DividendInfo>;
  getFxRate(pair: "USDBRL"): Promise<FxRate>;
  getMacro(): Promise<MacroIndicator[]>;
  getEtfProfile(ticker: string): Promise<EtfProfile>;
}
