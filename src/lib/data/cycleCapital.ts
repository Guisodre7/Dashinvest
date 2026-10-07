import "server-only";
import type { Repo } from "../db/repo";

/**
 * Capital disponível para aporte NESTE ciclo (mês), por carteira.
 *
 * É sempre o valor efetivamente informado pelo usuário — o motor analisa exatamente esse
 * valor (R$ 2.500, R$ 10.000 ou o que for). Não existe valor padrão, mínimo, máximo nem
 * normalização para a faixa histórica: a faixa de aportes do perfil (spec §2) é só contexto.
 * Fluxo: capital do ciclo → oportunidades atuais → alternativas → carteira existente →
 * pesos, concentração, risco e valuation → distribuição (a divisão é a consequência).
 */
export type CapitalMarket = "BR" | "US";

export interface CycleCapital {
  market: CapitalMarket;
  amount: number;
  /** Ciclo de referência (AAAA-MM, horário de Brasília). */
  cycle: string;
  updated_at: string;
}

const KEY = (m: CapitalMarket) => `cycle_capital_${m}`;

export const currentCycle = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(d).slice(0, 7);

/** Capital informado para o ciclo atual; de um mês anterior não vale (o usuário informa de novo). */
export async function getCycleCapital(repo: Repo, market: CapitalMarket, now = new Date()): Promise<CycleCapital | null> {
  const raw = await repo.getSetting<CycleCapital>(KEY(market)).catch(() => null);
  if (!raw || typeof raw.amount !== "number" || !(raw.amount > 0)) return null;
  return raw.cycle === currentCycle(now) ? raw : null;
}

/** Grava o capital informado (qualquer valor positivo — sem teto nem piso). */
export async function setCycleCapital(repo: Repo, market: CapitalMarket, amount: number, now = new Date()): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) return;
  await repo.setSetting(KEY(market), { market, amount: Math.round(amount * 100) / 100, cycle: currentCycle(now), updated_at: now.toISOString() } satisfies CycleCapital).catch(() => undefined);
}
