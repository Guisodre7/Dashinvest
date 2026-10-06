import "server-only";
import { buildMeta } from "../freshness";
import { getText } from "../http";
import type { Capability } from "../provider";
import { ProviderUnavailableError, type MacroIndicator } from "../types";
import { etCloseIso } from "./alphavantage";
import { PartialProvider } from "./base";

const NAME = "fred";
const SERIES = [
  { id: "DGS10", key: "US10Y", label: "Treasury 10 anos", days: 75 },
  { id: "DFF", key: "FEDFUNDS", label: "Fed Funds (efetiva)", days: 75 },
  // Humor do mercado: volatilidade, estresse de crédito e incerteza de política econômica.
  { id: "VIXCLS", key: "VIX", label: "VIX", days: 75 },
  { id: "BAMLH0A0HYM2", key: "HYSPREAD", label: "Spread high yield", days: 400 },
  { id: "USEPUINDXD", key: "EPU", label: "Incerteza de política econômica (EUA)", days: 400 },
] as const;
type SeriesKey = (typeof SERIES)[number]["key"];

/**
 * FRED (Federal Reserve Bank of St. Louis) — juros dos EUA pelo CSV público,
 * gratuito e sem chave. Séries diárias publicadas com 1 dia útil de atraso.
 */
export class FredProvider extends PartialProvider {
  readonly name = NAME;
  readonly capabilities: ReadonlySet<Capability> = new Set<Capability>(["macro"]);

  async getMacro(): Promise<MacroIndicator[]> {
    const out = await Promise.all(SERIES.map(async (s) => {
      const since = new Date(Date.now() - s.days * 86_400_000).toISOString().slice(0, 10);
      const csv = await getText(NAME, s.id, `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${s.id}&cosd=${since}`, { revalidate: 6 * 3600 }).catch(() => null);
      return csv ? indicatorFromSeries(s.key, s.label, parseFredCsv(csv)) : null;
    }));
    const ok = out.filter((m): m is MacroIndicator => m !== null);
    if (!ok.length) throw new ProviderUnavailableError(NAME, "macro");
    return ok;
  }
}

/** CSV do FRED → pontos em ordem decrescente de data ("." = sem valor). */
export function parseFredCsv(csv: string): { date: string; value: number }[] {
  return csv.trim().split(/\r?\n/).slice(1)
    .map((line) => {
      const [date, raw] = line.split(",");
      const value = Number(raw);
      return { date: date?.trim() ?? "", value: raw && raw.trim() !== "." && Number.isFinite(value) ? value : NaN };
    })
    .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isFinite(p.value))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function indicatorFromSeries(key: SeriesKey, label: string, s: { date: string; value: number }[]): MacroIndicator | null {
  if (!s.length) return null;
  const [cur, prev] = s;
  const monthAgo = s[21] ?? s[s.length - 1];
  const sorted = s.map((p) => p.value).sort((a, b) => a - b);
  // EPU diário é ruidoso: usa a média de 7 dias.
  const value = key === "EPU" ? s.slice(0, 7).reduce((a, p) => a + p.value, 0) / Math.min(7, s.length) : cur.value;
  return {
    key, label, value, ref: s.length >= 120 ? sorted[Math.floor(sorted.length / 2)] : null,
    change: prev ? cur.value - prev.value : null,
    change_pct: null,
    change_1m: monthAgo && monthAgo !== cur ? cur.value - monthAgo.value : null,
    unit: key === "VIX" || key === "EPU" ? "points" : "percent", proxy: null,
    meta: buildMeta({ timestamp: etCloseIso(cur.date), source: NAME, is_realtime: false }),
  };
}
