import "server-only";
import type { Stance } from "../analysis/stance";
import { parseTaxSettings, usStances, type TaxSettings } from "../analysis/stanceInput";
import type { Repo } from "../db/repo";
import type { LoadedContext } from "./load";

export const TAX_KEY = "tax_rules";
export const HISTORY_KEY = "stance_history";
export const LADDER_KEY = "ladders";

/** Retrato diário compacto de cada ativo (para "O que mudou?"). */
export interface StanceSnap { p: number | null; b: Stance["band"]; q: Stance["quality"]; t: Stance["thesis"]; a: Stance["action"]; f: number | null }
export type StanceHistory = Record<string, Record<string, StanceSnap>>;

export interface LadderStep { price: number; pct: number }
export interface Ladder { sell: LadderStep[]; rebuy: LadderStep[]; updated_at: string }
export type Ladders = Record<string, Ladder>;

export async function loadStances(ctx: LoadedContext, repo: Repo): Promise<{ stances: Stance[]; tax: TaxSettings; realizedByTicker: Record<string, number> }> {
  const [rawTax, transactions] = await Promise.all([repo.getSetting<unknown>(TAX_KEY).catch(() => null), repo.getTransactions(1000).catch(() => [])]);
  const tax = parseTaxSettings(rawTax);
  const realizedByTicker: Record<string, number> = {};
  for (const t of transactions) if (t.kind === "sell" && t.ticker) realizedByTicker[t.ticker] = (realizedByTicker[t.ticker] ?? 0) + (t.realized_pnl ?? 0);
  return { stances: usStances(ctx.analyses, ctx.portfolio, transactions, tax), tax, realizedByTicker };
}

const dayBr = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

/** Grava (1x por dia, sobrescreve o dia) e mantém ~200 dias. */
export async function recordStanceHistory(repo: Repo, stances: Stance[], prices: Record<string, number | null>, now = new Date()) {
  const hist = ((await repo.getSetting<StanceHistory>(HISTORY_KEY).catch(() => null)) ?? {}) as StanceHistory;
  const fairOf = (s: Stance) => (s.bands.length ? s.bands[2].low! / 0.95 : null);
  hist[dayBr(now)] = Object.fromEntries(stances.map((s) => [s.ticker, { p: prices[s.ticker] ?? null, b: s.band, q: s.quality, t: s.thesis, a: s.action, f: fairOf(s) }]));
  const keep = Object.keys(hist).sort().slice(-200);
  await repo.setSetting(HISTORY_KEY, Object.fromEntries(keep.map((k) => [k, hist[k]])));
}

/** Snapshot mais próximo de N dias atrás (o mais antigo disponível se ainda não houver N dias). */
export function snapshotNear(hist: StanceHistory, daysAgo: number, now = new Date()): { date: string; snap: Record<string, StanceSnap> } | null {
  const dates = Object.keys(hist).sort();
  if (!dates.length) return null;
  const target = dayBr(new Date(now.getTime() - daysAgo * 86_400_000));
  const older = dates.filter((d) => d <= target);
  const date = older.length ? older[older.length - 1] : dates[0];
  return date === dayBr(now) && dates.length === 1 ? null : { date, snap: hist[date] };
}

/** Retrato do dia da operação (ou o mais recente até 5 dias antes). */
export function snapshotOn(hist: StanceHistory | null, date: string, ticker: string): StanceSnap | null {
  if (!hist) return null;
  const min = new Date(new Date(`${date}T12:00:00Z`).getTime() - 5 * 86_400_000).toISOString().slice(0, 10);
  const day = Object.keys(hist).filter((d) => d <= date && d >= min && hist[d][ticker]).sort().pop();
  return day ? hist[day][ticker] : null;
}
