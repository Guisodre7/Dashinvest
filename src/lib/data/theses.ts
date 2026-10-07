import "server-only";
import type { Repo } from "../db/repo";
import type { Thesis } from "../thesis/logic";
import type { Stance } from "../analysis/stance";
import { applyThesisState, effectiveThesisState, type ThesisState } from "../thesis/logic";

export const THESES_KEY = "theses";

export async function getTheses(repo: Repo): Promise<Thesis[]> {
  const raw = await repo.getSetting<Thesis[]>(THESES_KEY).catch(() => null);
  return Array.isArray(raw) ? raw : [];
}

export async function saveTheses(repo: Repo, list: Thesis[]) {
  await repo.setSetting(THESES_KEY, list.slice(0, 300));
}

export interface ThesisStatus { id: string; state: ThesisState; reason: string; by: "usuário" | "dados"; role: string | null }

/** Estado efetivo da tese ativa de cada ativo (com o evento que o explica). */
export function thesisStatuses(theses: Thesis[], stances: Stance[], market: "BR" | "US"): Record<string, ThesisStatus> {
  const out: Record<string, ThesisStatus> = {};
  for (const t of theses.filter((x) => x.status === "ativa" && x.market === market)) {
    const s = stances.find((x) => x.ticker === t.ticker);
    const eff = effectiveThesisState(t, s ? { thesis: s.thesis, headline: s.headline } : null);
    out[t.ticker] = { id: t.id, ...eff, role: t.role ?? null };
  }
  return out;
}

/** Postura final: valuation + estado da tese (sem gatilho mecânico — ver applyThesisState). */
export function withThesis(stances: Stance[], theses: Thesis[], market: "BR" | "US", held: (ticker: string) => boolean): Stance[] {
  const st = thesisStatuses(theses, stances, market);
  return stances.map((s) => (st[s.ticker] ? applyThesisState(s, st[s.ticker], held(s.ticker)) : s));
}
