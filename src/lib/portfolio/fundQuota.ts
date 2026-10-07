import type { QuotaPoint } from "../market/cvmFunds";
import { r2, type Holding } from "./ledger";

/** Marca das atualizações automáticas no histórico (o banco só aceita origem manual/print/import). */
export const CVM_NOTE = "Cota CVM";

export interface QuotaEstimate {
  value: number;
  date: string;
  fromDate: string;
  fromQuota: number;
  toQuota: number;
  note: string;
}

const br = (d: string) => d.split("-").reverse().join("/");

/**
 * Saldo de um fundo atualizado pela variação da cota oficial (CVM):
 *   saldo novo = último saldo conhecido × cota mais recente ÷ cota na data desse saldo.
 * Não precisa saber o número de cotas. É o saldo BRUTO estimado (antes de IR/IOF e do
 * come-cotas); sem cota na data base ou sem cota mais nova, devolve null (nada é inventado).
 */
export function estimateByQuota(h: Pick<Holding, "current_value" | "current_value_at">, series: QuotaPoint[]): QuotaEstimate | null {
  if (h.current_value === null || !h.current_value_at || !series.length) return null;
  const base = [...series].reverse().find((p) => p.date <= h.current_value_at!);
  const last = series[series.length - 1];
  if (!base || last.date <= h.current_value_at || !(base.quota > 0)) return null;
  const value = r2(h.current_value * (last.quota / base.quota));
  const pct = ((last.quota / base.quota - 1) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  return {
    value, date: last.date, fromDate: base.date, fromQuota: base.quota, toQuota: last.quota,
    note: `${CVM_NOTE} de ${br(last.date)} vs ${br(base.date)} (${pct}%): saldo bruto estimado, antes de IR/IOF`,
  };
}
