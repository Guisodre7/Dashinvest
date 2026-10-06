"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { invalidateUserContext } from "@/lib/data/load";
import { getRepo } from "@/lib/db/repo";
import { B3_TICKER, BrStrategySchema, DEFAULT_BR_STRATEGY, parseBrStrategy } from "@/lib/portfolio/brStrategy";
import { z } from "zod";
import { matchHolding, planFundImport, slugify, type FundImportInput, type FundImportPlan } from "@/lib/portfolio/fundImport";
import { applyEntry, PRICED, type AssetClass, type EntryInput, type Holding, type LedgerKind } from "@/lib/portfolio/ledger";

export interface FormState { ok: boolean; message: string | null }

const CLASSES: AssetClass[] = ["acao", "fii", "renda_fixa", "caixa"];
const KINDS: LedgerKind[] = ["buy", "sell", "contribution", "redemption", "dividend", "income", "fee", "balance"];

function num(v: FormDataEntryValue | null): number | null {
  // Aceita 1.234,56 (pt-BR) e 1234.56.
  let s = String(v ?? "").trim().replace(/\s|R\$/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Valor inválido: ${String(v)}`);
  return n;
}
const str = (v: FormDataEntryValue | null, max = 120) => String(v ?? "").trim().slice(0, max) || null;

async function done(userId: string, message: string): Promise<FormState> {
  await invalidateUserContext(userId);
  revalidatePath("/brasil");
  revalidatePath("/geral");
  return { ok: true, message };
}

export async function registerEntry(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    const repo = await getRepo(user.id);
    if (!(await repo.ledgerReady())) throw new Error("Carteira Brasil ainda não ativada: falta aplicar a migração 0004 no Supabase.");
    const asset_class = String(fd.get("asset_class")) as AssetClass;
    const kind = String(fd.get("kind")) as LedgerKind;
    if (!CLASSES.includes(asset_class) || !KINDS.includes(kind)) throw new Error("Tipo de movimentação inválido.");

    const priced = PRICED.has(asset_class);
    const name = str(fd.get("name"), 80);
    let code: string;
    if (priced) {
      code = String(fd.get("code") ?? "").trim().toUpperCase();
      if (!B3_TICKER.test(code)) throw new Error("Ticker B3 inválido (ex.: ITUB4, HGLG11).");
    } else {
      const existing = str(fd.get("existing_code"), 60);
      if (existing) code = existing;
      else {
        if (!name) throw new Error("Informe o nome do título/fundo.");
        code = slugify(name);
        if (!code) throw new Error("Nome inválido.");
      }
    }
    const tradeDate = str(fd.get("trade_date"), 10) ?? new Date().toISOString().slice(0, 10);
    if (tradeDate > new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)) throw new Error("Data no futuro.");
    const cnpj = str(fd.get("cnpj"), 20)?.replace(/[^\d]/g, "") || null;
    if (cnpj && cnpj.length !== 14) throw new Error("CNPJ deve ter 14 dígitos.");

    const input: EntryInput = {
      market: "BR", asset_class, code, kind, trade_date: tradeDate,
      quantity: num(fd.get("quantity")), price: num(fd.get("price")), amount: num(fd.get("amount")), fees: num(fd.get("fees")),
      name: name ?? undefined, cnpj, issuer: str(fd.get("issuer"), 80), notes: str(fd.get("notes"), 200), source: "manual",
    };
    const current = (await repo.getHoldings("BR")).find((h) => h.code === code) ?? null;
    const { holding, entry } = applyEntry(current, input);
    const id = await repo.addLedgerEntry(entry);
    try {
      await repo.saveHolding(holding);
    } catch (err) {
      if (id) await repo.deleteLedgerEntry(id).catch(() => undefined);
      throw err;
    }
    const realized = entry.realized_pnl !== null ? ` Lucro realizado: R$ ${entry.realized_pnl.toFixed(2).replace(".", ",")}.` : "";
    return done(user.id, `${kindLabel(kind)} de ${holding.name ?? code} registrad${g(kind)}.${realized}`);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Erro ao salvar." };
  }
}

const KIND_MSG: Record<LedgerKind, [string, "a" | "o"]> = {
  buy: ["Compra", "a"], sell: ["Venda", "a"], contribution: ["Aporte", "o"], redemption: ["Resgate", "o"],
  dividend: ["Dividendo", "o"], income: ["Rendimento", "o"], fee: ["Custo", "o"], balance: ["Saldo", "o"],
};
const kindLabel = (k: LedgerKind) => KIND_MSG[k][0];
const g = (k: LedgerKind) => KIND_MSG[k][1];

/** Desfaz uma movimentação: remove e recalcula a posição a partir das demais. */
export async function undoEntry(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    const repo = await getRepo(user.id);
    const id = String(fd.get("id") ?? "");
    const code = String(fd.get("code") ?? "");
    const all = await repo.getLedger("BR", code);
    const target = all.find((e) => e.id === id);
    if (!target) throw new Error("Movimentação não encontrada.");
    const rest = all.filter((e) => e.id !== id);
    const before = (await repo.getHoldings("BR")).find((h) => h.code === code);
    let holding: Holding | null = null;
    for (const e of rest) holding = applyEntry(holding, { ...e }).holding; // valida a sequência sem a movimentação
    const base: Holding = holding ?? {
      market: "BR", asset_class: target.asset_class, code, name: before?.name ?? null, cnpj: before?.cnpj ?? null, issuer: before?.issuer ?? null,
      quantity: 0, avg_price: 0, cost_basis: 0, current_value: null, current_value_at: null, currency: "BRL", notes: null,
    };
    await repo.deleteLedgerEntry(id);
    await repo.saveHolding({ ...base, name: before?.name ?? base.name, cnpj: before?.cnpj ?? base.cnpj, issuer: before?.issuer ?? base.issuer });
    return done(user.id, `${kindLabel(target.kind)} de ${before?.name ?? code} desfeit${g(target.kind)}.`);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? `Não foi possível desfazer: ${err.message}` : "Erro ao desfazer." };
  }
}

export async function saveBrStrategy(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    const repo = await getRepo(user.id);
    const prev = parseBrStrategy(await repo.getSetting<unknown>("br_strategy"));
    const names = new Map([...DEFAULT_BR_STRATEGY.assets, ...prev.assets].map((a) => [a.code, a.name]));
    const list = (field: string, asset_class: "acao" | "fii") => [...new Set(String(fd.get(field) ?? "")
      .toUpperCase().split(/[\s,;]+/).filter(Boolean))]
      .map((code) => ({ code, asset_class, name: names.get(code) ?? null, enabled: true }));
    const parsed = BrStrategySchema.safeParse({
      classes: { renda_fixa: num(fd.get("renda_fixa")), acao: num(fd.get("acao")), fii: num(fd.get("fii")) },
      assets: [...list("acoes", "acao"), ...list("fiis", "fii")],
    });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Configuração inválida.");
    await repo.setSetting("br_strategy", parsed.data);
    return done(user.id, "Estratégia Brasil salva.");
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Erro ao salvar." };
  }
}

// ---------------------------------------------------------------------------
// Importação de print de posição (fundo / renda fixa)
// ---------------------------------------------------------------------------

const money = z.number().finite().min(0).max(1e10);
const FundInput = z.object({
  name: z.string().trim().min(3).max(80),
  cnpj: z.string().regex(/^\d{14}$/).nullable(),
  invested: money.refine((v) => v > 0, "Valor investido deve ser maior que zero."),
  grossBalance: money.nullable(),
  netBalance: money.nullable(),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lots: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), amount: money })).max(50),
  use: z.enum(["net", "gross"]),
  creditPrivate: z.boolean(),
});

async function plan(raw: unknown): Promise<{ plan: FundImportPlan; input: FundImportInput; current: Holding | null; userId: string }> {
  const parsed = FundInput.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Dados do print inválidos.");
  const input = parsed.data;
  if (input.asOf > new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)) throw new Error("Data da posição no futuro.");
  const user = await requireUser();
  const repo = await getRepo(user.id);
  if (!(await repo.ledgerReady())) throw new Error("Carteira Brasil ainda não ativada (migração 0004).");
  const current = matchHolding((await repo.getHoldings("BR")).filter((h) => h.asset_class === "renda_fixa"), input);
  return { plan: planFundImport(current, input), input, current, userId: user.id };
}

/** Passo 1: mostra o que mudou em relação ao último estado salvo (nada é gravado). */
export async function previewFundImport(raw: unknown): Promise<{ ok: true; plan: FundImportPlan } | { ok: false; message: string }> {
  try {
    return { ok: true, plan: (await plan(raw)).plan };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Erro ao ler o print." };
  }
}

/** Passo 2: confirmado pelo usuário → grava as movimentações (origem: print) e a posição. */
export async function confirmFundImport(raw: unknown): Promise<FormState> {
  try {
    const { plan: p, input, current, userId } = await plan(raw);
    if (p.blocker) throw new Error(p.blocker);
    if (p.nothingChanged) return { ok: true, message: "Nada mudou desde o último print — nenhuma alteração gravada." };
    const repo = await getRepo(userId);
    let holding = current;
    const ids: string[] = [];
    try {
      for (const e of p.entries) {
        const r = applyEntry(holding, e);
        const id = await repo.addLedgerEntry(r.entry);
        if (id) ids.push(id);
        holding = r.holding;
      }
      await repo.saveHolding({ ...holding!, name: holding!.name ?? input.name, cnpj: input.cnpj ?? holding!.cnpj, notes: input.creditPrivate ? "Crédito privado" : holding!.notes });
    } catch (err) {
      for (const id of ids) await repo.deleteLedgerEntry(id).catch(() => undefined);
      throw err;
    }
    return done(userId, `${p.isNew ? "Posição criada" : "Posição atualizada"}: ${p.name}.`);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Erro ao salvar." };
  }
}
