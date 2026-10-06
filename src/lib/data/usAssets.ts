import "server-only";
import type { Repo } from "../db/repo";
import { getMarketDataProvider } from "../market";
import { ASSET_META } from "../portfolio/defaults";

const KNOWN_ETFS = new Set(["VOO", "VTI", "SPY", "QQQ", "IVV", "JEPQ", "JEPI", "SCHD", "LQD", "VNQ", "BND", "AGG", "TLT", "IEF", "VXUS", "VEA", "VWO", "DIA", "UUP", "GLD", "XLK", "SMH"]);

/**
 * Ativo novo dos EUA (ex.: NU): confere na bolsa pelo fornecedor de cotações
 * e cadastra automaticamente. Usado em Movimentar e em Estratégia.
 */
export async function ensureUsAsset(repo: Repo, ticker: string): Promise<void> {
  if ((await repo.getAssets()).some((a) => a.ticker === ticker)) return;
  let name: string | null = null;
  try {
    const q = await getMarketDataProvider().getQuote(ticker);
    if (!q.price) throw new Error("sem preço");
    name = q.name;
  } catch {
    throw new Error(`Não encontrei ${ticker} na NYSE/Nasdaq pelo fornecedor de cotações. Confira o ticker (ex.: NU, BRK.B).`);
  }
  await repo.upsertAsset({ ticker, name: name ?? ASSET_META[ticker]?.name ?? ticker, asset_type: KNOWN_ETFS.has(ticker) ? "etf" : "stock" });
}
