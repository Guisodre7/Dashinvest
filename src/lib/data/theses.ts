import "server-only";
import type { Repo } from "../db/repo";
import type { Thesis } from "../thesis/logic";

export const THESES_KEY = "theses";

export async function getTheses(repo: Repo): Promise<Thesis[]> {
  const raw = await repo.getSetting<Thesis[]>(THESES_KEY).catch(() => null);
  return Array.isArray(raw) ? raw : [];
}

export async function saveTheses(repo: Repo, list: Thesis[]) {
  await repo.setSetting(THESES_KEY, list.slice(0, 300));
}
