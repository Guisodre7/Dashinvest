"use server";
import { allocate, type AllocationResult } from "@/lib/analysis/allocation";
import { requireUser } from "@/lib/auth";
import { loadContext } from "@/lib/data/load";

export interface ContributionState {
  result: AllocationResult | null;
  error: string | null;
}

/** Calcula a distribuição do aporte. Nunca executa ordens — apenas recomenda. */
export async function calculateContribution(_prev: ContributionState, formData: FormData): Promise<ContributionState> {
  const user = await requireUser();
  const raw = String(formData.get("amount") ?? "").replace(/\./g, "").replace(",", ".");
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    return { result: null, error: "Informe um valor de aporte válido em US$." };
  }
  // Cálculo do aporte sempre com dados novos (a validade das cotações é decisiva aqui).
  const ctx = await loadContext(user, { fresh: true });
  const values = Object.fromEntries(ctx.portfolio.positions.map((p) => [p.ticker, p.valueUsd ?? 0]));
  const globalBlockReasons: string[] = [];
  const missingPrice = ctx.portfolio.missingPrices;
  if (missingPrice.length) globalBlockReasons.push(`Sem preço para ${missingPrice.join(", ")} — pesos atuais não podem ser calculados com segurança.`);
  const result = allocate({
    contribution: Math.round(amount * 100) / 100,
    analyses: ctx.analyses,
    values,
    existingOpportunityCash: ctx.opportunityCashBalance,
    settings: ctx.settings,
    globalBlockReasons,
  });
  try {
    await ctx.repo.saveRecommendation(result);
  } catch {
    // O histórico é opcional para exibir a recomendação.
  }
  return { result, error: null };
}
