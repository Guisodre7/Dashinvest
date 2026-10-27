import type { RawTrade } from "./normalize";

/** Rascunho do formulário de compra/venda da carteira Brasil a partir do print lido. */
export interface B3Draft {
  fields: { code: string | null; quantity: number | null; price: number | null; fees: number | null; trade_date: string | null };
  /** O que foi conferido (ex.: total = quantidade × preço). */
  checks: string[];
  /** O que precisa de atenção antes de salvar. */
  warnings: string[];
}

const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Converte a leitura do print (regras determinísticas, sem IA) em campos para a B3.
 * Fracionário (ITUB4F) vira o mesmo papel (ITUB4). Nada é salvo aqui: o usuário confere e confirma.
 */
export function b3Draft(raw: RawTrade, known: string[], mode: "buy" | "sell"): B3Draft {
  const warnings: string[] = [], checks: string[] = [];
  let code = raw.ticker?.toUpperCase().replace(/[\s.]/g, "") ?? null;
  const frac = code?.match(/^([A-Z]{4}\d{1,2})F$/);
  if (frac) code = frac[1];
  if (code && !/^[A-Z]{4}\d{1,2}$/.test(code)) { warnings.push(`"${code}" não parece um ticker da B3 — confira.`); code = null; }
  if (code && known.length && !known.includes(code)) checks.push(`${code} ainda não está na carteira: será um ativo novo.`);

  if (raw.side !== "unknown" && raw.side !== mode) {
    warnings.push(`O print parece ser de ${raw.side === "sell" ? "venda" : "compra"} — use a aba ${raw.side === "sell" ? "Venda" : "Compra"}.`);
  }
  if (raw.currency === "USD") warnings.push("O print está em dólar: use a carteira internacional.");

  const q = raw.quantity, p = raw.price, total = raw.gross_amount ?? null;
  if (q !== null && p !== null && total !== null) {
    const calc = q * p;
    if (Math.abs(calc - total) <= Math.max(0.05, total * 0.002)) checks.push(`Total confere: ${q} × ${brl(p)} = ${brl(total)}.`);
    else warnings.push(`Total do print (${brl(total)}) não bate com ${q} × ${brl(p)} = ${brl(calc)} — confira quantidade e preço.`);
  }
  const missing = [!code && "ticker", q === null && "quantidade", p === null && "preço"].filter(Boolean);
  if (missing.length) warnings.push(`Não encontrei: ${missing.join(", ")}. Preencha antes de salvar.`);
  if (!raw.trade_date) checks.push("O print não mostra a data: ficou a de hoje (ajuste se foi outro dia).");

  return { fields: { code, quantity: q, price: p, fees: raw.fees, trade_date: raw.trade_date }, checks, warnings };
}
