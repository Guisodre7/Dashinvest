import "server-only";
import type { AllocationResult } from "../analysis/allocation";
import type { Stance } from "../analysis/stance";
import type { Repo } from "../db/repo";

/**
 * Auditoria das recomendações (spec §33): cada cálculo de aporte grava o que foi visto e
 * decidido, para avaliar depois a qualidade do sistema (sem reescrever o passado).
 */
export interface AuditLine {
  ticker: string;
  amount: number;
  priority: string;
  action: string;
  /** Preço observado no momento da recomendação. */
  price: number | null;
  /** Intervalo de valor econômico (mín–base–máx) usado na decisão. */
  fair: { low: number | null; mid: number | null; high: number | null } | null;
  band: string | null;
  stance: string | null;
  weightNow: number;
  target: number;
  confidence: string;
  why: string;
  risks: string[];
}

export interface AuditEntry {
  market: "BR" | "US";
  at: string;
  /** Capital disponível no ciclo, exatamente como informado. */
  capital: number;
  invested: number;
  opportunityCash: number;
  context: string[];
  dataQuality: number;
  lines: AuditLine[];
}

const KEY = "recommendation_audit";
const MAX = 120;

export function auditEntry(market: "BR" | "US", r: AllocationResult, info: (ticker: string) => { price: number | null; stance: Stance | null; fair: AuditLine["fair"] }): AuditEntry {
  return {
    market, at: r.generatedAt, capital: r.contribution, invested: r.invested, opportunityCash: r.opportunityCash,
    context: r.notes, dataQuality: Math.round(r.dataQuality),
    lines: r.lines.map((l) => {
      const i = info(l.ticker);
      return {
        ticker: l.ticker, amount: l.amount, priority: l.priority, action: l.action, price: i.price, fair: i.fair,
        band: i.stance?.band ?? null, stance: i.stance?.action ?? null, weightNow: Math.round(l.currentWeight * 100) / 100,
        target: Math.round(l.targetWeight * 100) / 100, confidence: l.confidence, why: l.why, risks: l.risks,
      };
    }),
  };
}

export async function appendAudit(repo: Repo, e: AuditEntry): Promise<void> {
  const list = (await repo.getSetting<AuditEntry[]>(KEY).catch(() => null)) ?? [];
  // Recarregar a página com o mesmo cálculo no mesmo dia não gera registro repetido.
  const sig = (x: AuditEntry) => `${x.market}|${x.at.slice(0, 10)}|${x.capital}|${x.lines.map((l) => `${l.ticker}:${l.amount}`).join(",")}`;
  if (list.some((x) => sig(x) === sig(e))) return;
  await repo.setSetting(KEY, [e, ...list].slice(0, MAX)).catch(() => undefined);
}

export async function listAudit(repo: Repo, market?: "BR" | "US"): Promise<AuditEntry[]> {
  const list = (await repo.getSetting<AuditEntry[]>(KEY).catch(() => null)) ?? [];
  return market ? list.filter((e) => e.market === market) : list;
}
