import "server-only";
import { brStances, type BrStanceView } from "../analysis/brStance";
import { parseTaxSettings } from "../analysis/stanceInput";
import type { Repo } from "../db/repo";
import { getBrFundamentals } from "../market/brFundamentals";
import { getBrRates } from "../market/brRates";
import type { BrazilContext } from "./brazil";
import { TAX_KEY } from "./stances";
import { getTheses, withThesis } from "./theses";

export async function loadBrStances(br: BrazilContext, repo: Repo): Promise<{ views: BrStanceView[]; errors: Record<string, string> }> {
  const codes = [...new Set([...br.strategy.assets.filter((a) => a.enabled).map((a) => a.code), ...br.summary.holdings.filter((h) => h.asset_class === "acao" || h.asset_class === "fii").map((h) => h.code)])];
  const [{ data, errors }, rawTax, rates, theses] = await Promise.all([getBrFundamentals(codes), repo.getSetting(TAX_KEY).catch(() => null), getBrRates(), getTheses(repo).catch(() => [])]);
  const views = brStances(br.strategy, br.summary, br.entries, br.quotes, data, parseTaxSettings(rawTax), new Date(), rates?.real ?? null, rates?.ipca12m ?? null);
  // Estado da tese ajusta a postura (ameaçada segura compras; invalidada só pelo usuário).
  const held = (c: string) => br.summary.holdings.some((h) => h.code === c && h.quantity > 0);
  const adjusted = withThesis(views.map((v) => v.stance), theses, "BR", held);
  return { views: views.map((v, i) => ({ ...v, stance: adjusted[i] })), errors };
}
