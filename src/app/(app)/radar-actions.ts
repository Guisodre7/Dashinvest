"use server";
import { revalidatePath } from "next/cache";
import type { StrategyRow } from "@/lib/analysis/analyze";
import { requireUser } from "@/lib/auth";
import { invalidateUserContext } from "@/lib/data/load";
import { ensureUsAsset } from "@/lib/data/usAssets";
import { getRepo } from "@/lib/db/repo";
import { B3_TICKER, parseBrStrategy } from "@/lib/portfolio/brStrategy";

interface FormState { ok: boolean; message: string | null }

/**
 * "Adicionar ao meu radar": o ativo entra na estratégia (numa classe que já existe)
 * e passa a participar do cálculo do aporte. A meta da classe não muda — é
 * redividida entre os ativos dela.
 */
export async function addToRadar(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    const repo = await getRepo(user.id);
    const market = fd.get("market") === "BR" ? "BR" : "US";
    const ticker = String(fd.get("ticker") ?? "").trim().toUpperCase();
    const bucket = String(fd.get("bucket") ?? "").trim().toUpperCase();

    if (market === "BR") {
      if (!B3_TICKER.test(ticker)) throw new Error(`Ticker da B3 inválido: ${ticker}.`);
      const cls = bucket === "FII" ? "fii" : "acao";
      const s = parseBrStrategy(await repo.getSetting<unknown>("br_strategy"));
      const prev = s.assets.find((a) => a.code === ticker);
      const assets = prev ? s.assets.map((a) => (a.code === ticker ? { ...a, asset_class: cls, enabled: true } : a)) : [...s.assets, { code: ticker, asset_class: cls, name: null, enabled: true }];
      await repo.setSetting("br_strategy", { ...s, assets });
      await invalidateUserContext(user.id);
      revalidatePath("/", "layout");
      return { ok: true, message: `${ticker} entrou no radar (${cls === "fii" ? "FIIs" : "Ações"}) e já participa do aporte.` };
    }

    if (!/^[A-Z.]{1,10}$/.test(ticker)) throw new Error(`Ticker inválido: ${ticker}.`);
    const rows = await repo.getStrategy();
    const active = rows.filter((r) => r.enabled && !r.is_legacy);
    const members = active.filter((r) => r.strategy_bucket === bucket);
    if (!members.length) throw new Error("Escolha uma classe da sua estratégia.");
    if (members.some((r) => r.ticker === ticker)) return { ok: true, message: `${ticker} já está no radar.` };
    await ensureUsAsset(repo, ticker);
    const classPct = members.reduce((a, r) => a + r.target_weight, 0);
    const target = Math.round((classPct / (members.length + 1)) * 100) / 100;
    const r2 = (v: number) => Math.round(v * 100) / 100;
    const reset = (t: string, prev?: StrategyRow): StrategyRow => ({
      ...(prev ?? { legacy_label: null }), ticker: t, target_weight: target, min_weight: r2(target * 0.6), max_weight: r2(target * 1.5),
      enabled: true, accepts_contributions: true, is_legacy: false, legacy_label: null, priority: members[0].priority, strategy_bucket: bucket,
    });
    const next = rows.filter((r) => r.ticker !== ticker).map((r) => (r.enabled && !r.is_legacy && r.strategy_bucket === bucket ? reset(r.ticker, r) : r));
    next.push(reset(ticker, rows.find((r) => r.ticker === ticker)));
    await repo.saveStrategy(next);
    await invalidateUserContext(user.id);
    revalidatePath("/", "layout");
    return { ok: true, message: `${ticker} entrou no radar em ${bucket} (meta ${target.toFixed(2)}%) e já participa do aporte.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Erro ao adicionar." };
  }
}
