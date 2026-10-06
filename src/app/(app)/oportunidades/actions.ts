"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { parseTaxSettings } from "@/lib/analysis/stanceInput";
import { LADDER_KEY, TAX_KEY, type Ladders } from "@/lib/data/stances";
import { getRepo } from "@/lib/db/repo";

type FormState = { ok: boolean; message: string | null };
const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim().replace(",", ".");
  return s === "" ? undefined : Number(s);
};

export async function saveTaxRules(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const repo = await getRepo(user.id);
  const pct = (k: string) => { const v = num(fd.get(k)); return v === undefined ? undefined : v / 100; };
  const rules = parseTaxSettings({
    US: { feePerOrder: num(fd.get("us_fee")), gainTaxRate: pct("us_rate"), minTicket: num(fd.get("us_min")) },
    BR_ACAO: { feePerOrder: num(fd.get("br_fee")), gainTaxRate: pct("br_rate"), monthlyExemption: num(fd.get("br_exempt")), minTicket: num(fd.get("br_min")) },
    BR_FII: { feePerOrder: num(fd.get("br_fee")), gainTaxRate: pct("fii_rate"), monthlyExemption: null, minTicket: num(fd.get("br_min")) },
  });
  await repo.setSetting(TAX_KEY, rules);
  revalidatePath("/oportunidades");
  return { ok: true, message: "Premissas salvas." };
}

/** Plano de escada (venda parcial e recompra em degraus) — só planejamento, nunca ordem. */
export async function saveLadder(ticker: string, sell: { price: number; pct: number }[], rebuy: { price: number; pct: number }[]): Promise<FormState> {
  const user = await requireUser();
  if (!/^[A-Z.]{1,10}$/.test(ticker)) return { ok: false, message: "Ativo inválido." };
  const clean = (xs: { price: number; pct: number }[]) => xs
    .filter((x) => Number.isFinite(x.price) && x.price > 0 && Number.isFinite(x.pct) && x.pct > 0 && x.pct <= 100)
    .slice(0, 5).map((x) => ({ price: Math.round(x.price * 100) / 100, pct: Math.round(x.pct) }));
  const s = clean(sell), r = clean(rebuy);
  if (s.reduce((a, x) => a + x.pct, 0) > 100) return { ok: false, message: "A soma das vendas passa de 100% da posição." };
  if (r.reduce((a, x) => a + x.pct, 0) > 100) return { ok: false, message: "A soma das recompras passa de 100% do vendido." };
  const repo = await getRepo(user.id);
  const all = ((await repo.getSetting<Ladders>(LADDER_KEY)) ?? {}) as Ladders;
  if (!s.length && !r.length) delete all[ticker];
  else all[ticker] = { sell: s.sort((a, b) => a.price - b.price), rebuy: r.sort((a, b) => b.price - a.price), updated_at: new Date().toISOString() };
  await repo.setSetting(LADDER_KEY, all);
  revalidatePath(`/ativo/${ticker}`);
  return { ok: true, message: s.length || r.length ? "Plano salvo. O monitor avisa quando o preço chegar a um degrau." : "Plano removido." };
}
