import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import type { StrategyRow } from "../analysis/analyze";
import type { StoredEstimate } from "../analysis/estimates";
import type { EngineSettings } from "../analysis/settings";
import type { AllocationResult } from "../analysis/allocation";
import { isLocalDevMode } from "../devmode";
import type { EarningsEstimates, AnalystData } from "../market/types";
import type { DividendRow, PositionRow } from "../portfolio/calc";
import { ASSET_META, DEFAULT_STRATEGY } from "../portfolio/defaults";
import { createSupabaseAdminClient, createSupabaseServerClient } from "../supabase/server";

export interface AssetRow { ticker: string; name: string; asset_type: "stock" | "etf" }

export interface TransactionRow {
  id?: string;
  ticker: string | null;
  kind: "buy" | "sell" | "deposit" | "fee";
  quantity: number | null;
  price: number | null;
  fees: number;
  fx_rate: number | null;
  currency: string;
  broker: string | null;
  trade_date: string;
  notes: string | null;
}

export interface SnapshotRow {
  as_of: string;
  total_usd: number;
  total_brl: number | null;
  cost_usd: number;
  cost_brl: number | null;
  usd_brl: number | null;
}

export interface AlertRow {
  id?: string;
  ticker: string | null;
  kind: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  message: string;
  dedupe_key: string;
  created_at?: string;
  read_at?: string | null;
}

export interface StoredRecommendation extends AllocationResult { id?: string }

/**
 * Repositório de dados do usuário. Em produção: Supabase com RLS (sessão do
 * usuário) e service role apenas para dados de mercado. Em LOCAL_DEV_MODE:
 * arquivo JSON local (.dev-data.json), nunca em produção.
 */
export interface Repo {
  getAssets(): Promise<AssetRow[]>;
  upsertAsset(a: AssetRow): Promise<void>;
  getStrategy(): Promise<StrategyRow[]>;
  saveStrategy(rows: StrategyRow[]): Promise<void>;
  getPositions(): Promise<PositionRow[]>;
  upsertPosition(p: PositionRow): Promise<void>;
  deletePosition(ticker: string): Promise<void>;
  getTransactions(limit?: number): Promise<TransactionRow[]>;
  addTransaction(t: TransactionRow): Promise<void>;
  getDividends(): Promise<DividendRow[]>;
  addDividend(d: DividendRow & { amount_per_share: number | null; quantity: number | null }): Promise<void>;
  getSetting<T>(key: string): Promise<T | null>;
  setSetting(key: string, value: unknown): Promise<void>;
  getEstimateHistory(ticker: string): Promise<StoredEstimate[]>;
  saveEstimates(est: EarningsEstimates): Promise<void>;
  saveAnalystSnapshot(a: AnalystData): Promise<void>;
  saveRecommendation(r: AllocationResult): Promise<void>;
  getLatestRecommendation(): Promise<StoredRecommendation | null>;
  getSnapshots(sinceDays: number | null): Promise<SnapshotRow[]>;
  saveSnapshot(s: SnapshotRow & { positions: unknown }): Promise<void>;
  getAlerts(limit?: number): Promise<AlertRow[]>;
  upsertAlerts(alerts: AlertRow[]): Promise<void>;
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

type Db = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

class SupabaseRepo implements Repo {
  constructor(private db: Db, private userId: string) {}

  private get admin() {
    return createSupabaseAdminClient();
  }

  private check<T>(res: { data: T; error: { message: string } | null }): T {
    if (res.error) throw new Error(res.error.message);
    return res.data;
  }

  async getAssets() {
    const rows = this.check(await this.db.from("assets").select("ticker,name,asset_type").order("ticker"));
    return (rows ?? []) as AssetRow[];
  }

  async upsertAsset(a: AssetRow) {
    const admin = this.admin;
    if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente — não é possível cadastrar ativos.");
    this.check(await admin.from("assets").upsert(a as never));
  }

  async getStrategy() {
    const rows = this.check(await this.db.from("portfolio_strategy").select("*").eq("user_id", this.userId).order("priority"));
    return ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
      ticker: String(r.ticker),
      target_weight: num(r.target_weight) ?? 0,
      min_weight: num(r.min_weight),
      max_weight: num(r.max_weight),
      enabled: !!r.enabled,
      accepts_contributions: !!r.accepts_contributions,
      is_legacy: !!r.is_legacy,
      legacy_label: (r.legacy_label as string) ?? null,
      priority: Number(r.priority ?? 0),
      strategy_bucket: String(r.strategy_bucket),
    }));
  }

  async saveStrategy(rows: StrategyRow[]) {
    const payload = rows.map((r) => ({ ...r, user_id: this.userId, updated_at: new Date().toISOString() }));
    this.check(await this.db.from("portfolio_strategy").upsert(payload as never, { onConflict: "user_id,ticker" }));
    this.check(await this.db.from("target_allocations").insert(
      rows.map((r) => ({ user_id: this.userId, ticker: r.ticker, target_weight: r.target_weight, strategy_bucket: r.strategy_bucket })) as never,
    ));
  }

  async getPositions() {
    const rows = this.check(await this.db.from("portfolio_positions").select("*").eq("user_id", this.userId));
    return ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      ticker: String(r.ticker),
      quantity: num(r.quantity) ?? 0,
      avg_price: num(r.avg_price) ?? 0,
      avg_fx_rate: num(r.avg_fx_rate),
      purchase_date: (r.purchase_date as string) ?? null,
      broker: (r.broker as string) ?? null,
      fees: num(r.fees) ?? 0,
      currency: String(r.currency ?? "USD"),
    }));
  }

  async upsertPosition(p: PositionRow) {
    const { id: _id, ...rest } = p;
    this.check(await this.db.from("portfolio_positions").upsert(
      { ...rest, user_id: this.userId, updated_at: new Date().toISOString() } as never,
      { onConflict: "user_id,ticker" },
    ));
  }

  async deletePosition(ticker: string) {
    this.check(await this.db.from("portfolio_positions").delete().eq("user_id", this.userId).eq("ticker", ticker));
  }

  async getTransactions(limit = 100) {
    const rows = this.check(await this.db.from("transactions").select("*").eq("user_id", this.userId).order("trade_date", { ascending: false }).limit(limit));
    return (rows ?? []) as TransactionRow[];
  }

  async addTransaction(t: TransactionRow) {
    this.check(await this.db.from("transactions").insert({ ...t, user_id: this.userId } as never));
  }

  async getDividends() {
    const rows = this.check(await this.db.from("dividends").select("*").eq("user_id", this.userId).order("pay_date", { ascending: false }));
    return ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
      ticker: String(r.ticker),
      kind: r.kind as "dividend" | "distribution",
      gross_amount: num(r.gross_amount) ?? 0,
      withholding_tax: num(r.withholding_tax) ?? 0,
      net_amount: num(r.net_amount) ?? undefined,
      pay_date: (r.pay_date as string) ?? null,
      ex_date: (r.ex_date as string) ?? null,
      reinvested: !!r.reinvested,
    }));
  }

  async addDividend(d: DividendRow & { amount_per_share: number | null; quantity: number | null }) {
    const { net_amount: _n, ...rest } = d;
    this.check(await this.db.from("dividends").insert({ ...rest, user_id: this.userId } as never));
  }

  async getSetting<T>(key: string) {
    const rows = this.check(await this.db.from("app_settings").select("value").eq("user_id", this.userId).eq("key", key).limit(1));
    return ((rows as { value: T }[] | null)?.[0]?.value ?? null) as T | null;
  }

  async setSetting(key: string, value: unknown) {
    this.check(await this.db.from("app_settings").upsert(
      { user_id: this.userId, key, value, updated_at: new Date().toISOString() } as never,
      { onConflict: "user_id,key" },
    ));
  }

  async getEstimateHistory(ticker: string) {
    const since = new Date(Date.now() - 200 * 86_400_000).toISOString().slice(0, 10);
    const rows = this.check(await this.db.from("analyst_estimates").select("period,as_of,eps_avg,revenue_avg")
      .eq("ticker", ticker).gte("as_of", since).order("as_of", { ascending: false }));
    return ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
      period: String(r.period), as_of: String(r.as_of), eps_avg: num(r.eps_avg), revenue_avg: num(r.revenue_avg),
    }));
  }

  async saveEstimates(est: EarningsEstimates) {
    const admin = this.admin;
    if (!admin || !est.periods.length) return;
    const today = new Date().toISOString().slice(0, 10);
    await admin.from("analyst_estimates").upsert(est.periods.map((p) => ({
      ticker: est.ticker, period: p.period, period_end: p.period_end, eps_avg: p.eps_avg, eps_low: p.eps_low, eps_high: p.eps_high,
      revenue_avg: p.revenue_avg, revenue_low: p.revenue_low, revenue_high: p.revenue_high, analyst_count: p.analyst_count,
      source: est.meta.source, as_of: today,
    })) as never, { onConflict: "ticker,period,source,as_of" });
  }

  async saveAnalystSnapshot(a: AnalystData) {
    const admin = this.admin;
    if (!admin) return;
    const r = a.recommendations[0];
    await admin.from("analyst_revisions").upsert({
      ticker: a.ticker, as_of: new Date().toISOString().slice(0, 10),
      strong_buy: r?.strong_buy ?? null, buy: r?.buy ?? null, hold: r?.hold ?? null, sell: r?.sell ?? null, strong_sell: r?.strong_sell ?? null,
      target_mean: a.target_mean, target_median: a.target_median, target_low: a.target_low, target_high: a.target_high,
      upgrades_30d: a.upgrades_30d, downgrades_30d: a.downgrades_30d, upgrades_90d: a.upgrades_90d, downgrades_90d: a.downgrades_90d,
      source: a.meta.source,
    } as never, { onConflict: "ticker,source,as_of" });
  }

  async saveRecommendation(r: AllocationResult) {
    this.check(await this.db.from("recommendations").insert({
      user_id: this.userId, contribution_usd: r.contribution, invested_usd: r.invested, opportunity_cash_usd: r.opportunityCash,
      blocked: r.blocked, block_reasons: r.blockReasons, data_quality: r.dataQuality, allocations: r.lines,
      inputs: { notes: r.notes, cashReason: r.cashReason, generatedAt: r.generatedAt },
    } as never));
  }

  async getLatestRecommendation() {
    const rows = this.check(await this.db.from("recommendations").select("*").eq("user_id", this.userId).order("created_at", { ascending: false }).limit(1));
    const r = (rows as Record<string, unknown>[] | null)?.[0];
    if (!r) return null;
    const inputs = (r.inputs ?? {}) as { notes?: string[]; cashReason?: string | null; generatedAt?: string };
    return {
      id: String(r.id), contribution: num(r.contribution_usd) ?? 0, invested: num(r.invested_usd) ?? 0,
      opportunityCash: num(r.opportunity_cash_usd) ?? 0, cashReason: inputs.cashReason ?? null, blocked: !!r.blocked,
      blockReasons: (r.block_reasons as string[]) ?? [], lines: (r.allocations as AllocationResult["lines"]) ?? [],
      dataQuality: num(r.data_quality) ?? 0, generatedAt: inputs.generatedAt ?? String(r.created_at), notes: inputs.notes ?? [],
    };
  }

  async getSnapshots(sinceDays: number | null) {
    let q = this.db.from("portfolio_snapshots").select("as_of,total_usd,total_brl,cost_usd,cost_brl,usd_brl").eq("user_id", this.userId);
    if (sinceDays) q = q.gte("as_of", new Date(Date.now() - sinceDays * 86_400_000).toISOString());
    const rows = this.check(await q.order("as_of", { ascending: true }).limit(2000));
    return ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
      as_of: String(r.as_of), total_usd: num(r.total_usd) ?? 0, total_brl: num(r.total_brl), cost_usd: num(r.cost_usd) ?? 0,
      cost_brl: num(r.cost_brl), usd_brl: num(r.usd_brl),
    }));
  }

  async saveSnapshot(s: SnapshotRow & { positions: unknown }) {
    const db = this.admin ?? this.db;
    this.check(await db.from("portfolio_snapshots").insert({ ...s, user_id: this.userId } as never));
  }

  async getAlerts(limit = 30) {
    const rows = this.check(await this.db.from("alerts").select("*").order("created_at", { ascending: false }).limit(limit));
    return (rows ?? []) as AlertRow[];
  }

  async upsertAlerts(alerts: AlertRow[]) {
    const db = this.admin;
    if (!db || !alerts.length) return;
    await db.from("alerts").upsert(alerts.map((a) => ({ ...a, user_id: this.userId })) as never, { onConflict: "dedupe_key", ignoreDuplicates: true });
  }
}

// ---------------------------------------------------------------------------
// Local (desenvolvimento)
// ---------------------------------------------------------------------------

interface LocalData {
  assets: AssetRow[];
  strategy: StrategyRow[];
  positions: PositionRow[];
  transactions: TransactionRow[];
  dividends: DividendRow[];
  settings: Record<string, unknown>;
  estimates: (StoredEstimate & { ticker: string })[];
  recommendations: AllocationResult[];
  snapshots: SnapshotRow[];
  alerts: AlertRow[];
}

const LOCAL_FILE = path.join(process.cwd(), ".dev-data.json");
// Serializa leituras/escritas concorrentes do arquivo local (evita corrupção).
let localQueue: Promise<unknown> = Promise.resolve();

class LocalRepo implements Repo {
  private async load(): Promise<LocalData> {
    let raw: string;
    try {
      raw = await fs.readFile(LOCAL_FILE, "utf8");
    } catch {
      return {
        assets: Object.entries(ASSET_META).map(([ticker, m]) => ({ ticker, name: m.name, asset_type: m.isEtf ? "etf" : "stock" })),
        strategy: DEFAULT_STRATEGY, positions: [], transactions: [], dividends: [], settings: {},
        estimates: [], recommendations: [], snapshots: [], alerts: [],
      };
    }
    // Arquivo existente e inválido: falha em vez de sobrescrever com dados vazios.
    return JSON.parse(raw) as LocalData;
  }
  private async save(d: LocalData) {
    const tmp = `${LOCAL_FILE}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(d, null, 2));
    await fs.rename(tmp, LOCAL_FILE);
  }
  private mutate(fn: (d: LocalData) => void): Promise<void> {
    const next = localQueue.then(async () => {
      const d = await this.load();
      fn(d);
      await this.save(d);
    });
    localQueue = next.catch(() => undefined);
    return next;
  }

  async getAssets() { return (await this.load()).assets; }
  async upsertAsset(a: AssetRow) { await this.mutate((d) => { d.assets = [...d.assets.filter((x) => x.ticker !== a.ticker), a]; }); }
  async getStrategy() { return (await this.load()).strategy; }
  async saveStrategy(rows: StrategyRow[]) { await this.mutate((d) => { d.strategy = rows; }); }
  async getPositions() { return (await this.load()).positions; }
  async upsertPosition(p: PositionRow) { await this.mutate((d) => { d.positions = [...d.positions.filter((x) => x.ticker !== p.ticker), p]; }); }
  async deletePosition(ticker: string) { await this.mutate((d) => { d.positions = d.positions.filter((x) => x.ticker !== ticker); }); }
  async getTransactions(limit = 100) { return (await this.load()).transactions.slice(0, limit); }
  async addTransaction(t: TransactionRow) { await this.mutate((d) => { d.transactions.unshift(t); }); }
  async getDividends() { return (await this.load()).dividends.map((x) => ({ ...x, net_amount: x.gross_amount - x.withholding_tax })); }
  async addDividend(x: DividendRow) { await this.mutate((d) => { d.dividends.unshift(x); }); }
  async getSetting<T>(key: string) { return ((await this.load()).settings[key] as T) ?? null; }
  async setSetting(key: string, value: unknown) { await this.mutate((d) => { d.settings[key] = value; }); }
  async getEstimateHistory(ticker: string) { return (await this.load()).estimates.filter((e) => e.ticker === ticker); }
  async saveEstimates(est: EarningsEstimates) {
    const today = new Date().toISOString().slice(0, 10);
    await this.mutate((d) => {
      d.estimates = d.estimates.filter((e) => !(e.ticker === est.ticker && e.as_of === today));
      d.estimates.push(...est.periods.map((p) => ({ ticker: est.ticker, period: p.period, as_of: today, eps_avg: p.eps_avg, revenue_avg: p.revenue_avg })));
    });
  }
  async saveAnalystSnapshot() {}
  async saveRecommendation(r: AllocationResult) { await this.mutate((d) => { d.recommendations.unshift(r); d.recommendations = d.recommendations.slice(0, 20); }); }
  async getLatestRecommendation() { return (await this.load()).recommendations[0] ?? null; }
  async getSnapshots(sinceDays: number | null) {
    const cutoff = sinceDays ? new Date(Date.now() - sinceDays * 86_400_000).toISOString() : "";
    return (await this.load()).snapshots.filter((s) => s.as_of >= cutoff);
  }
  async saveSnapshot(s: SnapshotRow) { await this.mutate((d) => { d.snapshots.push(s); }); }
  async getAlerts(limit = 30) { return (await this.load()).alerts.slice(0, limit); }
  async upsertAlerts(alerts: AlertRow[]) {
    await this.mutate((d) => {
      const keys = new Set(d.alerts.map((a) => a.dedupe_key));
      d.alerts.unshift(...alerts.filter((a) => !keys.has(a.dedupe_key)).map((a) => ({ ...a, created_at: new Date().toISOString() })));
      d.alerts = d.alerts.slice(0, 200);
    });
  }
}

export async function getRepo(userId: string): Promise<Repo> {
  if (isLocalDevMode()) return new LocalRepo();
  return new SupabaseRepo(await createSupabaseServerClient(), userId);
}

/** Repositório service-role para jobs (cron), sem sessão de usuário. */
export function getServiceRepo(userId: string): Repo | null {
  if (isLocalDevMode()) return new LocalRepo();
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  return new SupabaseRepo(admin as unknown as Db, userId);
}
