import { parseAmount } from "./parseText";

/**
 * Lê o TEXTO de um print de posição em fundo/título de renda fixa (app do
 * banco/corretora) — regras determinísticas, sem IA. Só preenche o que
 * aparece; o resto fica null. `verified` só é true quando os números batem
 * entre si (líquido − investido = rendimento informado).
 */
export interface FundPosition {
  name: string | null;
  cnpj: string | null;
  category: string | null;
  invested: number | null;
  grossBalance: number | null;
  netBalance: number | null;
  income: number | null;
  quotaPrice: number | null;
  /** Data da posição/cotação (YYYY-MM-DD). */
  asOf: string | null;
  lots: { date: string; amount: number }[];
  /** "CrPr"/"Crédito Privado" no nome ou no texto. */
  creditPrivate: boolean;
  verified: boolean;
  warnings: string[];
}

const MONEY = String.raw`R\$\s*(-?\d[\d.]*,\d{2})`;
const DATE = /(\d{2})\/(\d{2})\/(\d{4})/;
const iso = (m: RegExpMatchArray) => `${m[3]}-${m[2]}-${m[1]}`;

function moneyAfter(text: string, labels: string[]): number | null {
  for (const l of labels) {
    const m = text.match(new RegExp(`${l}\\s*:?\\s*${MONEY}`, "i"));
    if (m) return parseAmount(m[1]);
  }
  return null;
}

const CATEGORIES = ["Renda Fixa", "Multimercado", "Ações", "Acoes", "Cambial", "Previdência", "Previdencia", "Crédito Privado", "Credito Privado", "Tesouro Direto", "CDB", "LCI", "LCA", "CRI", "CRA", "Debênture", "Debenture"];
const NOISE = /^\d{1,2}:\d{2}\b|^[<←]/;

export function parseFundPosition(text: string, today = new Date()): FundPosition {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const lines = clean.split("\n").map((l) => l.trim()).filter(Boolean);
  const warnings: string[] = [];

  // Nome: linhas "de texto" logo acima da categoria (ex.: "BTG Pactual Credito Bancario" / "FIRF CrPr RL").
  const catIdx = lines.findIndex((l) => CATEGORIES.some((c) => l.toLowerCase() === c.toLowerCase()));
  const category = catIdx >= 0 ? lines[catIdx] : null;
  let name: string | null = null;
  if (catIdx > 0) {
    const parts: string[] = [];
    for (let i = catIdx - 1; i >= 0 && parts.length < 3; i--) {
      const l = lines[i];
      const letters = (l.match(/\p{L}/gu) ?? []).length;
      if (NOISE.test(l) || l.length < 6 || letters / l.length < 0.6 || /R\$/.test(l)) break;
      parts.unshift(l);
    }
    name = parts.join(" ").replace(/\s+/g, " ").trim() || null;
  }
  if (!name) warnings.push("Nome do fundo não identificado.");

  const invested = moneyAfter(clean, ["Valor investido", "Valor aplicado", "Total aplicado", "Total investido"]);
  const grossBalance = moneyAfter(clean, ["Saldo bruto", "Valor bruto", "Posição bruta", "Saldo atual"]);
  const netBalance = moneyAfter(clean, ["Saldo l[ií]quido", "Valor l[ií]quido", "L[ií]quido para resgate", "Posição l[ií]quida"]);
  const income = moneyAfter(clean, ["Rendimento total", "Rendimento bruto", "Rendimento", "Rentabilidade em R\\$"]);
  const quota = clean.match(new RegExp(`Cota[çc][aã]o atual\\s*:?\\s*R\\$\\s*(\\d[\\d.]*,\\d+)`, "i"));
  const quotaPrice = quota ? parseAmount(quota[1]) : null;

  // Data: "atualizada em 06/10/2026" (pode quebrar a linha) ou "posição em …".
  const dm = clean.match(/(?:atualizad[ao] em|posi[çc][aã]o em|data base|em)\s*\n?\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  let asOf = dm ? iso(dm) : null;
  const todayIso = today.toISOString().slice(0, 10);
  if (asOf && asOf > todayIso) { warnings.push("Data da posição no futuro — conferir."); asOf = null; }
  if (!asOf) warnings.push("Data da posição não encontrada — usando hoje.");

  const cnpjM = clean.match(/\b(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/);
  const cnpj = cnpjM ? cnpjM[1].replace(/\D/g, "") : null;

  // "Posição por compra": linhas "30/09/2026 R$ 3.000,00".
  const lots: FundPosition["lots"] = [];
  for (const l of lines) {
    const m = l.match(new RegExp(`^(\\d{2})\\/(\\d{2})\\/(\\d{4})\\s+${MONEY}`));
    if (m) { const amount = parseAmount(m[4]); if (amount) lots.push({ date: `${m[3]}-${m[2]}-${m[1]}`, amount }); }
  }

  const creditPrivate = /\bCr\s?Pr\b|cr[eé]dito privado/i.test(clean);
  if (invested === null) warnings.push("Valor investido não encontrado.");
  if (grossBalance === null && netBalance === null) warnings.push("Saldo não encontrado.");

  // Conferência: líquido − investido ≈ rendimento (ou bruto − investido).
  let verified = false;
  if (invested !== null && income !== null) {
    const base = netBalance ?? grossBalance;
    verified = base !== null && Math.abs(base - invested - income) <= 0.05
      || grossBalance !== null && Math.abs(grossBalance - invested - income) <= 0.05;
    if (!verified) warnings.push("Os valores lidos não fecham entre si (saldo − investido ≠ rendimento) — revise antes de salvar.");
  }
  if (lots.length && invested !== null && lots.reduce((a, l) => a + l.amount, 0) > invested + 0.05) warnings.push("Soma das compras listadas maior que o valor investido — conferir.");

  return { name, cnpj, category, invested, grossBalance, netBalance, income, quotaPrice, asOf, lots, creditPrivate, verified: verified && !!name, warnings };
}
