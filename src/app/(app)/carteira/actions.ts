"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { invalidateUserContext } from "@/lib/data/load";
import { getRepo } from "@/lib/db/repo";
import type { PositionRow } from "@/lib/portfolio/calc";

const TICKER = /^[A-Z.]{1,10}$/;

function num(v: FormDataEntryValue | null, opts: { required?: boolean; min?: number } = {}): number | null {
  const s = String(v ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!s) {
    if (opts.required) throw new Error("Campo obrigatório ausente.");
    return null;
  }
  const n = Number(s);
  if (!Number.isFinite(n) || (opts.min !== undefined && n < opts.min)) throw new Error(`Valor inválido: ${s}`);
  return n;
}

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, 120) : null;
}

function date(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export interface FormState { ok: boolean; message: string | null }

async function run(fn: () => Promise<string>): Promise<FormState> {
  try {
    const message = await fn();
    invalidateUserContext((await requireUser()).id);
    revalidatePath("/", "layout");
    return { ok: true, message };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Erro ao salvar." };
  }
}

export async function savePosition(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const repo = await getRepo(user.id);
    const ticker = String(fd.get("ticker") ?? "").trim().toUpperCase();
    if (!TICKER.test(ticker)) throw new Error("Ticker inválido.");
    const assets = await repo.getAssets();
    if (!assets.some((a) => a.ticker === ticker)) throw new Error(`${ticker} não está cadastrado em Ativos (Estratégia).`);
    await repo.upsertPosition({
      ticker,
      quantity: num(fd.get("quantity"), { required: true, min: 0 })!,
      avg_price: num(fd.get("avg_price"), { required: true, min: 0 })!,
      avg_fx_rate: num(fd.get("avg_fx_rate"), { min: 0 }),
      purchase_date: date(fd.get("purchase_date")),
      broker: str(fd.get("broker")),
      fees: num(fd.get("fees"), { min: 0 }) ?? 0,
      currency: (str(fd.get("currency")) ?? "USD").toUpperCase(),
    });
    return `Posição ${ticker} salva.`;
  });
}

export async function deletePosition(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const ticker = String(fd.get("ticker") ?? "").toUpperCase();
    if (!TICKER.test(ticker)) throw new Error("Ticker inválido.");
    await (await getRepo(user.id)).deletePosition(ticker);
    return `Posição ${ticker} removida do registro (nenhuma ordem é enviada).`;
  });
}

export interface BuyUndo {
  transactionId: string;
  ticker: string;
  /** Posição antes da compra (null = não havia posição). */
  previous: PositionRow | null;
}
export interface BuyState extends FormState { undo?: BuyUndo | null }

/** Registra uma compra e atualiza quantidade e preço médio (e câmbio médio). */
export async function registerBuy(_: BuyState, fd: FormData): Promise<BuyState> {
  let undo: BuyUndo | null = null;
  const result = await run(async () => {
    const user = await requireUser();
    const repo = await getRepo(user.id);
    const ticker = String(fd.get("ticker") ?? "").trim().toUpperCase();
    if (!TICKER.test(ticker)) throw new Error("Ticker inválido.");
    const qty = num(fd.get("quantity"), { required: true, min: 0 })!;
    const price = num(fd.get("price"), { required: true, min: 0 })!;
    const fees = num(fd.get("fees"), { min: 0 }) ?? 0;
    const fx = num(fd.get("fx_rate"), { min: 0 });
    const tradeDate = date(fd.get("trade_date")) ?? new Date().toISOString().slice(0, 10);
    if (qty <= 0) throw new Error("Quantidade deve ser maior que zero.");

    // Comprovante já registrado? (número da transação/ordem da corretora)
    const tradeId = String(fd.get("trade_id") ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24) || null;
    if (tradeId) {
      const dup = (await repo.getTransactions(1000)).find((t) => (t.notes ?? "").toUpperCase().includes(`#${tradeId}`));
      if (dup) throw new Error(`Este comprovante (#${tradeId}) já foi registrado em ${dup.trade_date.split("-").reverse().join("/")}. Nada foi alterado.`);
    }

    const positions = await repo.getPositions();
    const cur = positions.find((p) => p.ticker === ticker);
    const newQty = (cur?.quantity ?? 0) + qty;
    const avgPrice = ((cur?.quantity ?? 0) * (cur?.avg_price ?? 0) + qty * price) / newQty;
    let avgFx: number | null = cur?.avg_fx_rate ?? null;
    if (fx) {
      const prevCost = (cur?.quantity ?? 0) * (cur?.avg_price ?? 0);
      avgFx = cur && cur.quantity > 0 && cur.avg_fx_rate ? (prevCost * cur.avg_fx_rate + qty * price * fx) / (prevCost + qty * price) : fx;
    } else if (cur && cur.quantity > 0 && cur.avg_fx_rate) {
      avgFx = null; // câmbio desconhecido para parte do custo: não inventamos
    }
    const notes = [str(fd.get("notes")), tradeId ? `Comprovante #${tradeId}` : null].filter(Boolean).join(" · ") || null;
    const transactionId = await repo.addTransaction({
      ticker, kind: "buy", quantity: qty, price, fees, fx_rate: fx, currency: "USD",
      broker: str(fd.get("broker")), trade_date: tradeDate, notes,
    });
    if (transactionId) undo = { transactionId, ticker, previous: cur ? { ...cur } : null };
    await repo.upsertPosition({
      ticker, quantity: newQty, avg_price: avgPrice, avg_fx_rate: avgFx,
      purchase_date: cur?.purchase_date ?? tradeDate, broker: str(fd.get("broker")) ?? cur?.broker ?? null,
      fees: (cur?.fees ?? 0) + fees, currency: "USD",
    });
    return `Compra de ${qty} ${ticker} registrada.${!fx && cur?.avg_fx_rate ? " Câmbio não informado — retorno cambial desta posição ficará indisponível." : ""}`;
  });
  return { ...result, undo: result.ok ? undo : null };
}

/** Desfaz uma compra recém-registrada: restaura a posição anterior e apaga a transação. */
export async function undoBuy(u: BuyUndo): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const repo = await getRepo(user.id);
    if (!u || typeof u.transactionId !== "string" || !TICKER.test(String(u.ticker))) throw new Error("Nada para desfazer.");
    const prev = u.previous;
    if (prev) {
      if (prev.ticker !== u.ticker || !(prev.quantity >= 0) || !(prev.avg_price >= 0)) throw new Error("Dados inválidos para desfazer.");
      await repo.upsertPosition({ ...prev, ticker: u.ticker });
    } else {
      await repo.deletePosition(u.ticker);
    }
    await repo.deleteTransaction(u.transactionId);
    return `Registro de ${u.ticker} desfeito.`;
  });
}

export async function registerDividend(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const ticker = String(fd.get("ticker") ?? "").trim().toUpperCase();
    if (!TICKER.test(ticker)) throw new Error("Ticker inválido.");
    const kind = fd.get("kind") === "distribution" ? "distribution" : "dividend";
    await (await getRepo(user.id)).addDividend({
      ticker, kind,
      gross_amount: num(fd.get("gross_amount"), { required: true, min: 0 })!,
      withholding_tax: num(fd.get("withholding_tax"), { min: 0 }) ?? 0,
      amount_per_share: num(fd.get("amount_per_share"), { min: 0 }),
      quantity: num(fd.get("quantity"), { min: 0 }),
      ex_date: date(fd.get("ex_date")),
      pay_date: date(fd.get("pay_date")),
      reinvested: fd.get("reinvested") === "on",
    });
    return `${kind === "distribution" ? "Distribuição" : "Dividendo"} de ${ticker} registrado.`;
  });
}

export async function setOpportunityCash(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await requireUser();
    const v = num(fd.get("balance"), { required: true, min: 0 })!;
    await (await getRepo(user.id)).setSetting("opportunity_cash_balance", v);
    return "Saldo de caixa de oportunidade atualizado.";
  });
}
