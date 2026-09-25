"use server";
import { revalidatePath } from "next/cache";
import type { StrategyRow } from "@/lib/analysis/analyze";
import { FACTOR_KEYS, mergeSettings, type EngineSettings } from "@/lib/analysis/settings";
import { requireUser } from "@/lib/auth";
import { invalidateUserContext } from "@/lib/data/load";
import { getRepo } from "@/lib/db/repo";

interface FormState { ok: boolean; message: string | null }

function num(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function saveStrategy(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    const repo = await getRepo(user.id);
    const current = await repo.getStrategy();
    const tickers = String(fd.get("tickers") ?? "").split(",").filter(Boolean);
    const rows: StrategyRow[] = tickers.map((t) => {
      const prev = current.find((c) => c.ticker === t);
      const target = num(fd.get(`target_${t}`)) ?? 0;
      const min = num(fd.get(`min_${t}`));
      const max = num(fd.get(`max_${t}`));
      if (target < 0 || target > 100 || (min !== null && (min < 0 || min > 100)) || (max !== null && (max < 0 || max > 100))) {
        throw new Error(`${t}: pesos devem estar entre 0 e 100.`);
      }
      if (min !== null && max !== null && min > max) throw new Error(`${t}: peso mínimo maior que o máximo.`);
      const isLegacy = fd.get(`legacy_${t}`) === "on";
      return {
        ticker: t,
        target_weight: isLegacy ? 0 : target,
        min_weight: min,
        max_weight: max,
        enabled: fd.get(`enabled_${t}`) === "on",
        accepts_contributions: !isLegacy && fd.get(`contrib_${t}`) === "on",
        is_legacy: isLegacy,
        legacy_label: isLegacy ? (prev?.legacy_label ?? "Posição legada / Anchor") : null,
        priority: Math.round(num(fd.get(`priority_${t}`)) ?? prev?.priority ?? 0),
        strategy_bucket: String(fd.get(`bucket_${t}`) ?? prev?.strategy_bucket ?? "").trim().toUpperCase().slice(0, 40) || "OUTROS",
      };
    });
    const sum = rows.filter((r) => r.enabled && !r.is_legacy).reduce((s, r) => s + r.target_weight, 0);
    if (Math.abs(sum - 100) > 0.05) throw new Error(`A soma dos pesos-alvo ativos é ${sum.toFixed(2)}% — deve ser 100%.`);
    await repo.saveStrategy(rows);
    await invalidateUserContext(user.id);
    revalidatePath("/", "layout");
    return { ok: true, message: "Estratégia salva." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Erro ao salvar." };
  }
}

export async function addAsset(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    const repo = await getRepo(user.id);
    const ticker = String(fd.get("ticker") ?? "").trim().toUpperCase();
    if (!/^[A-Z.]{1,10}$/.test(ticker)) throw new Error("Ticker inválido.");
    const name = String(fd.get("name") ?? "").trim().slice(0, 120) || ticker;
    const type = fd.get("asset_type") === "etf" ? "etf" : "stock";
    await repo.upsertAsset({ ticker, name, asset_type: type });
    const strategy = await repo.getStrategy();
    if (!strategy.some((s) => s.ticker === ticker)) {
      await repo.saveStrategy([...strategy, {
        ticker, target_weight: 0, min_weight: null, max_weight: null, enabled: false, accepts_contributions: false,
        is_legacy: false, legacy_label: null, priority: 5, strategy_bucket: String(fd.get("bucket") ?? "OUTROS").toUpperCase() || "OUTROS",
      }]);
    }
    await invalidateUserContext(user.id);
    revalidatePath("/", "layout");
    return { ok: true, message: `${ticker} adicionado (desativado, peso 0). Ajuste os pesos para incluí-lo.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Erro ao salvar." };
  }
}

export async function saveEngineSettings(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    const repo = await getRepo(user.id);
    const weights: Record<string, number> = {};
    for (const k of FACTOR_KEYS) weights[k] = Math.max(0, num(fd.get(`w_${k}`)) ?? 0);
    const raw: Partial<EngineSettings> = {
      weights: weights as EngineSettings["weights"],
      maxOpportunityCashPct: (num(fd.get("maxOpportunityCashPct")) ?? 20) / 100,
      maxOpportunityCashContributions: num(fd.get("maxOpportunityCashContributions")) ?? 2,
      minOrderUsd: num(fd.get("minOrderUsd")) ?? 10,
      earningsCautionDays: num(fd.get("earningsCautionDays")) ?? 7,
      minDataQuality: num(fd.get("minDataQuality")) ?? 60,
      fomo1mPct: num(fd.get("fomo1mPct")) ?? 20,
      fomo60dPct: num(fd.get("fomo60dPct")) ?? 30,
    };
    await repo.setSetting("engine", mergeSettings(raw));
    const def = num(fd.get("default_contribution"));
    if (def !== null && def > 0) await repo.setSetting("default_contribution", def);
    await invalidateUserContext(user.id);
    revalidatePath("/", "layout");
    return { ok: true, message: "Configurações salvas." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Erro ao salvar." };
  }
}
