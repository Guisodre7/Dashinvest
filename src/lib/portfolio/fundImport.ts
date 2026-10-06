import type { EntryInput, Holding } from "./ledger";

/** Dados confirmados pelo usuário a partir do print (editáveis antes de enviar). */
export interface FundImportInput {
  name: string;
  cnpj: string | null;
  invested: number;
  grossBalance: number | null;
  netBalance: number | null;
  asOf: string;
  lots: { date: string; amount: number }[];
  /** Qual saldo vira o "valor atual": líquido (após IR/IOF estimados pelo banco) ou bruto. */
  use: "net" | "gross";
  creditPrivate: boolean;
}

export interface FundImportPlan {
  code: string;
  name: string;
  isNew: boolean;
  before: { invested: number; value: number | null; at: string | null } | null;
  after: { invested: number; value: number };
  /** Movimentações que serão gravadas (em ordem). */
  entries: EntryInput[];
  changes: string[];
  /** Bloqueia a confirmação (ex.: provável resgate sem o valor recebido). */
  blocker: string | null;
  nothingChanged: boolean;
}

export function slugify(name: string) {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Acha a posição já cadastrada: CNPJ, depois identificador do nome. */
export function matchHolding(holdings: Holding[], input: Pick<FundImportInput, "name" | "cnpj">): Holding | null {
  if (input.cnpj) {
    const byCnpj = holdings.find((h) => h.cnpj === input.cnpj);
    if (byCnpj) return byCnpj;
  }
  const code = slugify(input.name);
  return holdings.find((h) => h.code === code || (h.name && slugify(h.name) === code)) ?? null;
}

/**
 * Compara o print com o último estado salvo:
 *  - posição nova → aportes (um por compra listada, se baterem com o total) + saldo;
 *  - valor investido maior → a diferença é APORTE (não rentabilidade);
 *  - valor investido menor → provável resgate: pede o valor recebido (nada é inventado);
 *  - saldo → atualização de valor (não é fluxo de caixa).
 */
export function planFundImport(existing: Holding | null, input: FundImportInput): FundImportPlan {
  const value = input.use === "net" ? input.netBalance ?? input.grossBalance : input.grossBalance ?? input.netBalance;
  if (value === null || !(value >= 0)) throw new Error("Saldo não informado.");
  if (!(input.invested > 0)) throw new Error("Valor investido inválido.");
  const code = existing?.code ?? slugify(input.name);
  if (!code) throw new Error("Nome do fundo inválido.");
  const base = { market: "BR" as const, asset_class: "renda_fixa" as const, code, source: "print" as const };
  const which = input.use === "net" ? "líquido" : "bruto";
  const detail = `Print · saldo bruto ${input.grossBalance !== null ? brl(input.grossBalance) : "—"} · líquido ${input.netBalance !== null ? brl(input.netBalance) : "—"}`;
  const entries: EntryInput[] = [];
  const changes: string[] = [];
  let blocker: string | null = null;

  if (!existing) {
    const lotsSum = input.lots.reduce((a, l) => a + l.amount, 0);
    if (input.lots.length && Math.abs(lotsSum - input.invested) <= 0.05) {
      for (const l of [...input.lots].sort((a, b) => a.date.localeCompare(b.date))) {
        entries.push({ ...base, kind: "contribution", trade_date: l.date, amount: l.amount, name: input.name, cnpj: input.cnpj, notes: "Compra listada no print" });
      }
    } else {
      entries.push({ ...base, kind: "contribution", trade_date: input.asOf, amount: input.invested, name: input.name, cnpj: input.cnpj, notes: "Posição inicial importada do print (valor investido total)" });
    }
    entries.push({ ...base, kind: "balance", trade_date: input.asOf, amount: value, notes: `${detail} · usado: ${which}` });
    changes.push(`Novo ativo detectado: ${input.name}`, `Valor investido: ${brl(input.invested)}`, `Saldo ${which}: ${brl(value)}`);
    return { code, name: input.name, isNew: true, before: null, after: { invested: input.invested, value }, entries, changes, blocker, nothingChanged: false };
  }

  const delta = Math.round((input.invested - existing.cost_basis) * 100) / 100;
  if (delta > 0.01) {
    entries.push({ ...base, kind: "contribution", trade_date: input.asOf, amount: delta, notes: "Aporte detectado no print (diferença do valor investido)" });
    changes.push(`Aporte detectado: +${brl(delta)} (dinheiro seu, não é rentabilidade)`);
  } else if (delta < -0.01) {
    blocker = `O valor investido caiu ${brl(-delta)}: provavelmente houve um resgate. Registre o resgate com o valor recebido (em "Registrar movimentação") e depois importe o print de novo.`;
  }
  const sameValue = existing.current_value !== null && Math.abs(existing.current_value - value) < 0.005 && existing.current_value_at?.slice(0, 10) === input.asOf;
  if (!sameValue) {
    entries.push({ ...base, kind: "balance", trade_date: input.asOf, amount: value, notes: `${detail} · usado: ${which}` });
    const before = existing.current_value;
    changes.push(`Saldo: ${before !== null ? brl(before) : "—"} → ${brl(value)}${before !== null ? ` (${value - before >= 0 ? "+" : ""}${brl(value - before)}${delta > 0.01 ? `, dos quais ${brl(delta)} são aporte` : ""})` : ""}`);
  }
  if (input.cnpj && !existing.cnpj) changes.push(`CNPJ registrado: ${input.cnpj}`);
  return {
    code, name: existing.name ?? input.name, isNew: false,
    before: { invested: existing.cost_basis, value: existing.current_value, at: existing.current_value_at },
    after: { invested: input.invested, value }, entries, changes, blocker,
    nothingChanged: !blocker && entries.length === 0,
  };
}
