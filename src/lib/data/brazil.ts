import "server-only";
import { serverConfig } from "../config";
import type { Repo } from "../db/repo";
import { getBrQuotes } from "../market/brapi";
import type { Quote } from "../market/types";
import { parseBrStrategy, type BrStrategy } from "../portfolio/brStrategy";
import { PRICED, summarizeLedger, type LedgerEntry, type PortfolioLedgerSummary } from "../portfolio/ledger";

export interface BrazilContext {
  /** false = migração 0004 ainda não aplicada (só a estratégia funciona). */
  ready: boolean;
  strategy: BrStrategy;
  entries: LedgerEntry[];
  quotes: Record<string, Quote | null>;
  summary: PortfolioLedgerSummary;
  /** Sem token da brapi só PETR4, VALE3, ITUB4 e MGLU3 têm cotação. */
  hasBrapiToken: boolean;
}

/** Carteira Brasil: posições, movimentações, cotações B3 e o resumo calculado no servidor. */
export async function loadBrazil(repo: Repo): Promise<BrazilContext> {
  const [ready, rawStrategy] = await Promise.all([repo.ledgerReady(), repo.getSetting<unknown>("br_strategy").catch(() => null)]);
  const strategy = parseBrStrategy(rawStrategy);
  const [holdings, entries] = ready ? await Promise.all([repo.getHoldings("BR"), repo.getLedger("BR")]) : [[], []];
  const codes = [...new Set([
    ...holdings.filter((h) => PRICED.has(h.asset_class) && h.quantity > 0).map((h) => h.code),
    ...strategy.assets.filter((a) => a.enabled).map((a) => a.code),
  ])];
  const quotes = await getBrQuotes(codes);
  const prices = Object.fromEntries(Object.entries(quotes).map(([k, q]) => [k, q?.price ?? null]));
  return { ready, strategy, entries, quotes, summary: summarizeLedger(holdings, entries, prices, strategy.classes), hasBrapiToken: !!serverConfig.brapiToken };
}
