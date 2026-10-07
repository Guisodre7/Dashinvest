"use server";
import { allocate, type AllocationResult } from "@/lib/analysis/allocation";
import { requireUser } from "@/lib/auth";
import { loadContext } from "@/lib/data/load";
import { appendAudit, auditEntry } from "@/lib/data/audit";
import { setCycleCapital } from "@/lib/data/cycleCapital";
import { loadStances, qualityPremiumOf, stanceActions } from "@/lib/data/stances";
import { parseMoneyInput } from "@/lib/userNumber";

export interface ContributionState {
  result: AllocationResult | null;
  error: string | null;
}

/**
 * Calcula a distribuição do capital disponível NESTE ciclo — exatamente o valor informado,
 * sem padrão, piso, teto ou normalização para a faixa histórica. Nunca executa ordens.
 */
export async function calculateContribution(_prev: ContributionState, formData: FormData): Promise<ContributionState> {
  const user = await requireUser();
  const amount = parseMoneyInput(String(formData.get("amount") ?? ""));
  if (amount === null || !Number.isFinite(amount) || amount <= 0) {
    return { result: null, error: "Informe o capital disponível neste ciclo, em US$." };
  }
  // Cálculo do aporte sempre com dados novos (a validade das cotações é decisiva aqui).
  const ctx = await loadContext(user, { fresh: true });
  const values = Object.fromEntries(ctx.portfolio.positions.map((p) => [p.ticker, p.valueUsd ?? 0]));
  const globalBlockReasons: string[] = [];
  const missingPrice = ctx.portfolio.missingPrices;
  if (missingPrice.length) globalBlockReasons.push(`Sem preço para ${missingPrice.join(", ")} — pesos atuais não podem ser calculados com segurança.`);
  const { stances } = await loadStances(ctx, ctx.repo);
  const result = allocate({
    contribution: Math.round(amount * 100) / 100,
    analyses: ctx.analyses,
    values,
    existingOpportunityCash: ctx.opportunityCashBalance,
    settings: ctx.settings,
    globalBlockReasons,
    stances: stanceActions(stances),
    qualityPremium: qualityPremiumOf(stances),
    mood: ctx.mood,
  });
  await setCycleCapital(ctx.repo, "US", amount);
  // Auditoria (spec §33): preço observado, intervalo de valor, postura e decisão de cada ativo.
  if (!result.blocked) {
    await appendAudit(ctx.repo, auditEntry("US", result, (t) => {
      const a = ctx.analyses.find((x) => x.ticker === t);
      const fv = a?.fairValue;
      return { price: a?.price ?? null, stance: stances.find((x) => x.ticker === t) ?? null, fair: fv?.available ? { low: fv.min, mid: fv.mean, high: fv.max } : null };
    }));
  }
  try {
    await ctx.repo.saveRecommendation(result);
  } catch {
    // O histórico é opcional para exibir a recomendação.
  }
  return { result, error: null };
}
