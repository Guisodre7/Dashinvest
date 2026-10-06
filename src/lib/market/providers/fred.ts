import "server-only";
import { buildMeta } from "../freshness";
import { getText } from "../http";
import type { Capability } from "../provider";
import { ProviderUnavailableError, type MacroIndicator } from "../types";
import { etCloseIso } from "./alphavantage";
import { PartialProvider } from "./base";

const NAME = "fred";
const SERIES = [
  { id: "DGS10", key: "US10Y", label: "Treasury 10 anos" },
  { id: "DFF", key: "FEDFUNDS", label: "Fed Funds (efetiva)" },
] as const;

/**
 * FRED (Federal Reserve Bank of St. Louis) — juros dos EUA pelo CSV público,
 * gratuito e sem chave. Séries diárias publicadas com 1 dia útil de atraso.
 */
export class FredProvider extends PartialProvider {
  readonly name = NAME;
  readonly capabilities: ReadonlySet<Capability> = new Set<Capability>(["macro"]);

  async getMacro(): Promise<MacroIndicator[]> {
    const since = new Date(Date.now() - 75 * 86_400_000).toISOString().slice(0, 10);
    const out = await Promise.all(SERIES.map(async (s) => {
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

export function indicatorFromSeries(key: "US10Y" | "FEDFUNDS", label: string, s: { date: string; value: number }[]): MacroIndicator | null {
  if (!s.length) return null;
  const [cur, prev] = s;
  const monthAgo = s[21] ?? s[s.length - 1];
  return {
    key, label, value: cur.value,
    change: prev ? cur.value - prev.value : null,
    change_pct: null,
    change_1m: monthAgo && monthAgo !== cur ? cur.value - monthAgo.value : null,
    unit: "percent", proxy: null,
    meta: buildMeta({ timestamp: etCloseIso(cur.date), source: NAME, is_realtime: false }),
  };
}
