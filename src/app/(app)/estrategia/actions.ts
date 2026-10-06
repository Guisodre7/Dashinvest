"use server";
import { revalidatePath } from "next/cache";
import type { StrategyRow } from "@/lib/analysis/analyze";
import { FACTOR_KEYS, mergeSettings, type EngineSettings } from "@/lib/analysis/settings";
import { requireUser } from "@/lib/auth";
import { invalidateUserContext } from "@/lib/data/load";
import { getRepo } from "@/lib/db/repo";
import { ensureUsAsset } from "@/lib/data/usAssets";

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

/**
 * Estratégia por classes (mesmo formato da carteira Brasil): cada classe tem um
 * percentual e uma lista de tickers; a meta de cada ativo é o percentual da
 * classe dividido pelo nº de ativos. Ticker novo é conferido na bolsa e cadastrado.
 */
export async function saveStrategyClasses(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    const repo = await getRepo(user.id);
    const current = await repo.getStrategy();
    const parseList = (v: FormDataEntryValue | null) => [...new Set(String(v ?? "").toUpperCase().split(/[\s,;]+/).filter(Boolean))];
    const rowsCount = Math.min(12, Number(fd.get("rows") ?? 0));
    const classes: { name: string; pct: number; tickers: string[] }[] = [];
    for (let i = 0; i < rowsCount; i++) {
      const name = String(fd.get(`cls_name_${i}`) ?? "").trim().toUpperCase().slice(0, 40);
      const pct = num(fd.get(`cls_pct_${i}`)) ?? 0;
      const tickers = parseList(fd.get(`cls_tickers_${i}`));
      if (!name && !pct && !tickers.length) continue;
      if (!name) throw new Error(`Dê um nome à classe da linha ${i + 1}.`);
      if (pct < 0 || pct > 100) throw new Error(`${name}: percentual deve estar entre 0 e 100.`);
      if (pct > 0 && !tickers.length) throw new Error(`${name}: informe ao menos um ticker.`);
      classes.push({ name, pct, tickers });
    }
    const legacy = parseList(fd.get("legacy"));
    const all = [...classes.flatMap((c) => c.tickers), ...legacy];
    const bad = all.find((t) => !/^[A-Z.]{1,10}$/.test(t));
    if (bad) throw new Error(`Ticker inválido: ${bad}.`);
    const dup = all.find((t, i) => all.indexOf(t) !== i);
    if (dup) throw new Error(`${dup} aparece em mais de uma classe.`);
    const sum = classes.reduce((a, c) => a + c.pct, 0);
    if (Math.abs(sum - 100) > 0.05) throw new Error(`A soma das classes é ${sum.toFixed(2)}% — deve ser 100%.`);
    for (const t of all) await ensureUsAsset(repo, t);

    const r2 = (v: number) => Math.round(v * 100) / 100;
    const rows: StrategyRow[] = [];
    classes.forEach((c, ci) => {
      const target = c.pct / c.tickers.length;
      for (const t of c.tickers) rows.push({
        ticker: t, target_weight: target, min_weight: r2(target * 0.6), max_weight: r2(target * 1.5), enabled: target > 0,
        accepts_contributions: target > 0, is_legacy: false, legacy_label: null, priority: ci + 1, strategy_bucket: c.name,
      });
    });
    for (const t of legacy) rows.push({
      ticker: t, target_weight: 0, min_weight: null, max_weight: null, enabled: true, accepts_contributions: false, is_legacy: true,
      legacy_label: current.find((c) => c.ticker === t)?.legacy_label ?? "Posição legada / Anchor", priority: 9, strategy_bucket: "LEGADO",
    });
    // Fora das listas: desativado (o histórico e a posição continuam).
    for (const c of current) if (!all.includes(c.ticker)) rows.push({ ...c, enabled: false, accepts_contributions: false, target_weight: 0, is_legacy: false });
    await repo.saveStrategy(rows);
    await invalidateUserContext(user.id);
    revalidatePath("/", "layout");
    return { ok: true, message: "Estratégia internacional salva." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Erro ao salvar." };
  }
}
