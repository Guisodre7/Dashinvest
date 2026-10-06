import "server-only";
import { getJson, toNum } from "../http";
import type { Capability, FxRate } from "../provider";
import { ProviderUnavailableError } from "../types";
import { PartialProvider } from "./base";

const AWESOME = "https://economia.awesomeapi.com.br/json/last/USD-BRL";
// SGS 1: dólar comercial (venda), fechamento diário — Banco Central do Brasil.
const BCB_SGS = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.1/dados/ultimos/30?formato=json";

export type AwesomeBody = { USDBRL?: { bid?: string; timestamp?: string; create_date?: string } };
export type SgsRow = { data: string; valor: string };

/**
 * Câmbio USD/BRL gratuito e sem chave: cotação intradiária da AwesomeAPI e
 * série oficial do Banco Central (variação em 1 mês e reserva se a primeira falhar).
 */
export class BrazilFxProvider extends PartialProvider {
  readonly name = "bcb";
  readonly capabilities: ReadonlySet<Capability> = new Set<Capability>(["fx"]);

  async getFxRate(pair: "USDBRL"): Promise<FxRate> {
    const [live, series] = await Promise.all([
      getJson<AwesomeBody>("awesomeapi", "USD-BRL", AWESOME, { revalidate: 60 }).catch(() => null),
      getJson<SgsRow[]>("bcb", "sgs.1", BCB_SGS, { revalidate: 6 * 3600 }).catch(() => null),
    ]);
    return combineFx(pair, live, series);
  }
}

/** "05/10/2026" → "2026-10-05" */
const sgsDate = (d: string) => d.split("/").reverse().join("-");

export function combineFx(pair: "USDBRL", live: AwesomeBody | null, series: SgsRow[] | null): FxRate {
  const rows = (Array.isArray(series) ? series : [])
    .map((r) => ({ date: sgsDate(String(r.data)), value: toNum(r.valor) }))
    .filter((r): r is { date: string; value: number } => r.value !== null && /^\d{4}-\d{2}-\d{2}$/.test(r.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const bid = toNum(live?.USDBRL?.bid);
  const seconds = toNum(live?.USDBRL?.timestamp);
  // 21 pregões ≈ 1 mês.
  const monthAgo = rows.length > 21 ? rows[rows.length - 22].value : null;
  const change = (rate: number) => (monthAgo ? ((rate - monthAgo) / monthAgo) * 100 : null);

  if (bid !== null && seconds !== null) {
    return { pair, rate: bid, timestamp: new Date(seconds * 1000).toISOString(), source: "awesomeapi", is_realtime: false, change_1m: change(bid) };
  }
  const last = rows[rows.length - 1];
  if (!last) throw new ProviderUnavailableError("bcb", "fx", pair);
  // Fechamento do dia (≈ 17h em Brasília).
  return { pair, rate: last.value, timestamp: new Date(`${last.date}T17:00:00-03:00`).toISOString(), source: "bcb-sgs", is_realtime: false, change_1m: change(last.value) };
}
