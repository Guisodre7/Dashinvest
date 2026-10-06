import { parseAmount } from "./parseText";

/**
 * Lê o TEXTO de um comprovante/notificação de dividendo ou distribuição
 * (corretora) — regras determinísticas, sem IA. `verified` só quando os
 * números fecham: bruto − imposto = líquido (ou por cota × cotas = bruto).
 */
export interface DividendDraft {
  ticker: string | null;
  kind: "dividend" | "distribution";
  gross: number | null;
  tax: number | null;
  net: number | null;
  perShare: number | null;
  quantity: number | null;
  payDate: string | null;
  exDate: string | null;
  verified: boolean;
  warnings: string[];
}

const NUM = String.raw`(?:US\$|U\$|USD|\$|R\$)?\s*(-?\d[\d.,]*\d|\d)`;
function after(text: string, labels: string[], gap = 30): number | null {
  for (const l of labels) {
    const m = text.match(new RegExp(`${l}[^\\d\\n-]{0,${gap}}(?:\\n\\s*)?${NUM}`, "i"));
    if (m) return parseAmount(m[1]);
  }
  return null;
}
function dateAfter(text: string, labels: string[]): string | null {
  for (const l of labels) {
    const m = text.match(new RegExp(`${l}[^\\d\\n]{0,25}(?:\\n\\s*)?(\\d{2})\\/(\\d{2})\\/(\\d{4})`, "i"))
      ?? text.match(new RegExp(`${l}[^\\d\\n]{0,25}(?:\\n\\s*)?(\\d{4})-(\\d{2})-(\\d{2})`, "i"));
    if (m) return m[1].length === 4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[2]}-${m[1]}`;
  }
  return null;
}

const ETF_DISTRIBUTION = new Set(["JEPQ", "LQD", "VNQ", "VOO"]);

export function parseDividendText(text: string, knownTickers: string[], today = new Date()): DividendDraft {
  const t = text.replace(/\r/g, "");
  const warnings: string[] = [];
  const upper = ` ${t.toUpperCase().replace(/[^A-Z0-9.\-/ \n]/g, " ")} `;
  const ticker = knownTickers.find((k) => {
    const variants = [k, k.replace(".", " "), k.replace(".", "-"), k.replace(".", "/")];
    return variants.some((v) => new RegExp(`[\\s:(]${v.replace(/[.\-/]/g, (c) => `\\${c}`)}[\\s:),]`).test(upper));
  }) ?? null;
  if (!ticker) warnings.push("Ativo não identificado entre os cadastrados.");

  const gross = after(t, ["Valor bruto", "Bruto", "Gross amount", "Gross", "Dividendo bruto", "Valor do dividendo"]);
  const tax = after(t, ["Imposto retido", "IR retido", "Imposto de renda", "Withholding tax", "Withholding", "Tax withheld", "Imposto"]);
  const net = after(t, ["Valor l[ií]quido", "L[ií]quido", "Net amount", "Net", "Valor creditado", "Total creditado", "Valor recebido"]);
  const perShare = after(t, ["Valor por a[çc][aã]o", "Valor por cota", "Por a[çc][aã]o", "Por cota", "Per share", "Rate"]);
  const quantity = after(t, ["Quantidade", "Qtd\\.?", "Cotas", "Shares", "Ações"]);
  const todayIso = today.toISOString().slice(0, 10);
  let payDate = dateAfter(t, ["Data de pagamento", "Pagamento", "Pago em", "Pay date", "Payment date", "Data do cr[eé]dito", "Creditado em"]);
  const exDate = dateAfter(t, ["Data ex", "Data com", "Ex-date", "Ex date", "Record date"]);
  if (payDate && payDate > todayIso) { warnings.push("Data de pagamento no futuro — conferir."); payDate = null; }
  const kind = (ticker && ETF_DISTRIBUTION.has(ticker)) || /distribui|distribution/i.test(t) ? "distribution" : "dividend";

  const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.011, b * 0.001);
  let g = gross, n = net, x = tax;
  // Completa só o que é aritmeticamente determinado pelos outros dois.
  if (g === null && n !== null && x !== null) g = Math.round((n + x) * 100) / 100;
  if (x === null && g !== null && n !== null && g >= n) x = Math.round((g - n) * 100) / 100;
  const sumOk = g !== null && n !== null && x !== null && close(g - x, n);
  const perOk = perShare !== null && quantity !== null && g !== null && close(perShare * quantity, g);
  if (g === null) warnings.push("Valor bruto não encontrado.");
  if (g !== null && n !== null && x !== null && !sumOk) warnings.push("Bruto − imposto ≠ líquido — revise antes de salvar.");
  return {
    ticker, kind, gross: g, tax: x, net: n, perShare, quantity, payDate, exDate,
    verified: !!ticker && g !== null && (sumOk || perOk) && !!payDate,
    warnings,
  };
}
