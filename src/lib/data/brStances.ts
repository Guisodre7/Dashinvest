import "server-only";
import { brStances, type BrStanceView } from "../analysis/brStance";
import { parseTaxSettings } from "../analysis/stanceInput";
import type { Repo } from "../db/repo";
import { getBrFundamentals } from "../market/brFundamentals";
import { getBrRates } from "../market/brRates";
import type { BrazilContext } from "./brazil";
import { TAX_KEY } from "./stances";

export async function loadBrStances(br: BrazilContext, repo: Repo): Promise<{ views: BrStanceView[]; errors: Record<string, string> }> {
  const codes = [...new Set([...br.strategy.assets.filter((a) => a.enabled).map((a) => a.code), ...br.summary.holdings.filter((h) => h.asset_class === "acao" || h.asset_class === "fii").map((h) => h.code)])];
  const [{ data, errors }, rawTax, rates] = await Promise.all([getBrFundamentals(codes), repo.getSetting(TAX_KEY).catch(() => null), getBrRates()]);
  return { views: brStances(br.strategy, br.summary, br.entries, br.quotes, data, parseTaxSettings(rawTax), new Date(), rates?.real ?? null), errors };
}
