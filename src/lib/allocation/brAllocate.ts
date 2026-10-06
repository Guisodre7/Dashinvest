import type { ActionKey, Stance } from "../analysis/stance";
import type { BrStrategy } from "../portfolio/brStrategy";
import { CLASS_LABEL, type PortfolioLedgerSummary } from "../portfolio/ledger";

export interface BrAllocLine { label: string; code: string | null; assetClass: "renda_fixa" | "acao" | "fii" | "caixa"; amount: number; reason: string; stance: ActionKey | null }
export interface BrAllocation { amount: number; lines: BrAllocLine[]; classSplit: { assetClass: "renda_fixa" | "acao" | "fii"; amount: number; why: string }[]; notes: string[] }

/**
 * Peso de cada postura na divisão dentro da classe: só prioridade média (manter,
 * preço razoável) ou alta (oportunidade) recebe, e a alta recebe o dobro.
 * Esticados, tese em risco ou sem dados de valuation esperam.
 */
const ACTION_WEIGHT: Partial<Record<ActionKey, number>> = { comprar: 2, recompra: 2, manter: 1 };
const r10 = (v: number) => Math.round(v / 10) * 10;

/**
 * Aporte da carteira Brasil:
 *  1) classes: corrige o desvio da meta primeiro (aporte não vende nada);
 *  2) dentro de ações/FIIs: proporcional à postura de cada ativo e ao quanto ele
 *     está abaixo da sua meta. Esticados/deteriorados não recebem; sem candidatos,
 *     a parte vai para caixa de oportunidade.
 */
export function allocateBr(amount: number, summary: PortfolioLedgerSummary, strategy: BrStrategy, stances: { code: string; assetClass: "acao" | "fii"; stance: Stance; name: string | null }[]): BrAllocation {
  const classes = ["renda_fixa", "acao", "fii"] as const;
  const total = summary.currentValue;
  const sumT = classes.reduce((a, c) => a + strategy.classes[c], 0) || 100;
  const value = (c: string) => summary.classes.find((x) => x.asset_class === c)?.value ?? 0;
  const need = Object.fromEntries(classes.map((c) => [c, Math.max(0, (strategy.classes[c] / sumT) * (total + amount) - value(c))])) as Record<(typeof classes)[number], number>;
  const needSum = classes.reduce((a, c) => a + need[c], 0);
  const classAmt = Object.fromEntries(classes.map((c) => [c, needSum >= amount
    ? amount * need[c] / needSum
    : need[c] + (amount - needSum) * strategy.classes[c] / sumT])) as Record<(typeof classes)[number], number>;
  const classSplit = classes.map((c) => ({
    assetClass: c, amount: classAmt[c],
    why: total > 0 ? `${CLASS_LABEL[c]}: ${((value(c) / total) * 100).toFixed(0)}% hoje × meta ${strategy.classes[c].toFixed(0)}%` : `Meta ${strategy.classes[c].toFixed(0)}%`,
  }));

  const lines: BrAllocLine[] = [];
  const notes: string[] = [];
  if (classAmt.renda_fixa >= 1) lines.push({ label: "Renda fixa", code: null, assetClass: "renda_fixa", amount: classAmt.renda_fixa, reason: "Escolha o título/fundo (CDB, Tesouro, fundo DI) — a renda fixa não passa pela análise de valuation.", stance: null });

  for (const c of ["acao", "fii"] as const) {
    const amt = classAmt[c];
    if (amt < 1) continue;
    const enabled = strategy.assets.filter((a) => a.enabled && a.asset_class === c);
    const target = strategy.classes[c] / (enabled.length || 1);
    const cands = enabled.map((a) => {
      const v = stances.find((s) => s.code === a.code);
      const w = v ? ACTION_WEIGHT[v.stance.action] ?? 0 : 0;
      const weightNow = summary.holdings.find((h) => h.code === a.code)?.weight ?? 0;
      const under = target > 0 ? Math.max(0, target - weightNow) / target : 0;
      // Já na meta ou acima: espera (o aporte não concentra a carteira).
      const full = summary.currentValue > 0 && target > 0 && weightNow >= target;
      return { a, v, score: full ? 0 : w * (1 + under) };
    }).filter((x) => x.score > 0);
    const sum = cands.reduce((s, x) => s + x.score, 0);
    if (!sum) {
      if (enabled.length) notes.push(`Sem aporte agora (esticados, tese em risco, sem dados ou já na meta): ${enabled.map((a) => a.code).join(", ")}.`);
      lines.push({ label: `Caixa de oportunidade (${CLASS_LABEL[c]})`, code: null, assetClass: "caixa", amount: amt, reason: `Nenhum ativo de ${CLASS_LABEL[c].toLowerCase()} em faixa razoável agora: guardar e aportar quando houver preço melhor.`, stance: null });
      continue;
    }
    for (const x of cands) {
      const action = x.v?.stance.action;
      lines.push({
        label: x.a.code, code: x.a.code, assetClass: c, amount: amt * x.score / sum,
        reason: action === "comprar" || action === "recompra" ? "Faixa de valuation atrativa: prioridade alta." : "Preço razoável: aporte normal.",
        stance: action ?? null,
      });
    }
    const skipped = enabled.filter((a) => !cands.some((x) => x.a.code === a.code)).map((a) => a.code);
    if (skipped.length) notes.push(`Sem aporte agora (esticados, tese em risco, sem dados ou já na meta): ${skipped.join(", ")}.`);
  }

  // Ordens pequenas demais (< R$ 50) são redistribuídas; arredonda a R$ 10.
  let small = lines.filter((l) => l.amount < 50 && l.assetClass !== "renda_fixa");
  if (small.length && small.length < lines.length) {
    const freed = small.reduce((a, l) => a + l.amount, 0);
    const keep = lines.filter((l) => !small.includes(l));
    const base = keep.reduce((a, l) => a + l.amount, 0);
    for (const l of keep) l.amount += freed * l.amount / base;
    notes.push(`Valores muito pequenos para ${small.map((l) => l.label).join(", ")} foram somados aos demais.`);
    lines.splice(0, lines.length, ...keep);
    small = [];
  }
  const rounded = lines.map((l) => ({ ...l, amount: r10(l.amount) }));
  const diff = r10(amount) - rounded.reduce((a, l) => a + l.amount, 0);
  if (rounded.length && diff) rounded.sort((x, y) => y.amount - x.amount)[0].amount += diff;
  return { amount, lines: rounded.filter((l) => l.amount > 0).sort((x, y) => y.amount - x.amount), classSplit, notes };
}
