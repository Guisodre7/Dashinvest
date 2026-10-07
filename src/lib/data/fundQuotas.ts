import type { Repo } from "../db/repo";
import { fetchCvmQuotas } from "../market/cvmFunds";
import { CVM_NOTE, estimateByQuota } from "../portfolio/fundQuota";
import { applyEntry } from "../portfolio/ledger";

export interface FundRefreshStatus {
  at: string;
  ok: boolean;
  updated: { code: string; name: string | null; value: number; date: string }[];
  /** Fundos de renda fixa sem CNPJ: não dá para buscar a cota. */
  withoutCnpj: string[];
  message: string;
}

export const FUND_STATUS_KEY = "cvm_funds_status";

/**
 * Atualiza o saldo dos fundos de renda fixa (com CNPJ) pela cota diária da CVM.
 * Mantém só uma atualização automática por fundo: a anterior é substituída se ainda for a última
 * movimentação (o resultado é o mesmo, pois as variações da cota se multiplicam).
 */
export async function refreshFundBalances(repo: Repo, now = new Date(), signal?: AbortSignal): Promise<FundRefreshStatus> {
  const holdings = (await repo.getHoldings("BR")).filter((h) => h.asset_class === "renda_fixa" && h.current_value !== null);
  const funds = holdings.filter((h) => h.cnpj && h.current_value_at);
  const withoutCnpj = holdings.filter((h) => !h.cnpj).map((h) => h.name ?? h.code);
  const status: FundRefreshStatus = { at: now.toISOString(), ok: true, updated: [], withoutCnpj, message: "" };
  try {
    if (funds.length) {
      const from = funds.map((h) => h.current_value_at!).sort()[0];
      const quotas = await fetchCvmQuotas(funds.map((h) => h.cnpj!), from, now, 3, signal);
      for (const h of funds) {
        const est = estimateByQuota(h, quotas.get(h.cnpj!.replace(/\D/g, "")) ?? []);
        if (!est) continue;
        const ledger = await repo.getLedger("BR", h.code);
        const last = ledger[ledger.length - 1];
        const { holding, entry } = applyEntry(h, {
          market: "BR", asset_class: "renda_fixa", code: h.code, kind: "balance", trade_date: est.date,
          amount: est.value, source: "import", notes: est.note,
        });
        await repo.addLedgerEntry(entry);
        await repo.saveHolding({ ...holding, id: h.id });
        if (last?.id && last.kind === "balance" && last.notes?.startsWith(CVM_NOTE)) await repo.deleteLedgerEntry(last.id);
        status.updated.push({ code: h.code, name: h.name, value: est.value, date: est.date });
      }
    }
    status.message = !funds.length
      ? "Nenhum fundo de renda fixa com CNPJ cadastrado."
      : status.updated.length
        ? `${status.updated.length} fundo(s) atualizado(s) pela cota da CVM.`
        : "A CVM ainda não publicou cota mais nova que o último saldo.";
  } catch (err) {
    status.ok = false;
    status.message = `Não foi possível ler a cota na CVM: ${err instanceof Error ? err.message.replace(/\.$/, "") : "erro"}. O saldo anterior foi mantido.`;
  }
  await repo.setSetting(FUND_STATUS_KEY, status).catch(() => undefined);
  return status;
}
