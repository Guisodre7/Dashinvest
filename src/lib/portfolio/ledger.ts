/**
 * Livro de movimentações multi-mercado (funções puras, sem I/O).
 *
 * Regra central: DINHEIRO QUE EU COLOQUEI ≠ DINHEIRO QUE O MERCADO GEROU.
 *  - compra/aporte aumentam o capital aportado, nunca a rentabilidade;
 *  - venda/resgate devolvem dinheiro; o lucro realizado é (valor recebido − custo do que saiu);
 *  - dividendos/rendimentos são renda gerada, separada da valorização;
 *  - "saldo" (renda fixa) só atualiza o valor atual: não é fluxo de caixa.
 * Valores monetários arredondados a centavos; preço médio inclui custos.
 */

export type Market = "BR" | "US";
export type AssetClass = "acao" | "fii" | "renda_fixa" | "etf" | "caixa";
export type LedgerKind = "buy" | "sell" | "contribution" | "redemption" | "dividend" | "income" | "fee" | "balance";

export const CLASS_LABEL: Record<AssetClass, string> = {
  acao: "Ações", fii: "FIIs", renda_fixa: "Renda fixa", etf: "ETFs", caixa: "Caixa",
};
export const KIND_LABEL: Record<LedgerKind, string> = {
  buy: "Compra", sell: "Venda", contribution: "Aporte", redemption: "Resgate",
  dividend: "Dividendo", income: "Rendimento", fee: "Custo/taxa", balance: "Saldo atualizado",
};
/** Classes com cotação (quantidade × preço); as demais têm saldo informado. */
export const PRICED: ReadonlySet<AssetClass> = new Set(["acao", "fii", "etf"]);

export interface Holding {
  id?: string;
  market: Market;
  asset_class: AssetClass;
  code: string;
  name: string | null;
  cnpj: string | null;
  issuer: string | null;
  quantity: number;
  avg_price: number;
  /** Custo do que continua investido. */
  cost_basis: number;
  /** Saldo informado (renda fixa/caixa). Para ativos cotados, use o preço. */
  current_value: number | null;
  current_value_at: string | null;
  currency: string;
  notes: string | null;
}

export interface LedgerEntry {
  id?: string;
  market: Market;
  asset_class: AssetClass;
  code: string;
  kind: LedgerKind;
  trade_date: string;
  quantity: number | null;
  price: number | null;
  amount: number;
  fees: number;
  realized_pnl: number | null;
  avg_price_after: number | null;
  currency: string;
  source: "manual" | "print" | "import";
  notes: string | null;
  created_at?: string;
}

export type EntryInput = Pick<LedgerEntry, "market" | "asset_class" | "code" | "kind" | "trade_date"> & {
  quantity?: number | null; price?: number | null; amount?: number | null; fees?: number | null;
  name?: string | null; cnpj?: string | null; issuer?: string | null;
  currency?: string; source?: LedgerEntry["source"]; notes?: string | null;
};

export const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

function emptyHolding(e: EntryInput): Holding {
  return {
    market: e.market, asset_class: e.asset_class, code: e.code, name: e.name ?? null, cnpj: e.cnpj ?? null, issuer: e.issuer ?? null,
    quantity: 0, avg_price: 0, cost_basis: 0, current_value: null, current_value_at: null, currency: e.currency ?? (e.market === "BR" ? "BRL" : "USD"), notes: null,
  };
}

/**
 * Aplica uma movimentação à posição. Lança Error com mensagem para o usuário
 * quando a movimentação é inválida (nada é gravado nesse caso).
 */
export function applyEntry(current: Holding | null, e: EntryInput): { holding: Holding; entry: LedgerEntry } {
  const h: Holding = current ? { ...current } : emptyHolding(e);
  if (current && current.asset_class !== e.asset_class) throw new Error(`${e.code} já está cadastrado como ${CLASS_LABEL[current.asset_class]}.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.trade_date)) throw new Error("Data inválida.");
  const fees = r2(e.fees ?? 0);
  if (fees < 0) throw new Error("Custos não podem ser negativos.");
  const priced = PRICED.has(e.asset_class);
  const qty = e.quantity ?? null;
  const price = e.price ?? null;
  let amount = e.amount ?? null;
  let realized: number | null = null;

  const needQtyPrice = () => {
    if (!priced) throw new Error(`${CLASS_LABEL[e.asset_class]} não usa quantidade × preço: registre aporte, resgate ou saldo.`);
    if (!qty || qty <= 0) throw new Error("Quantidade deve ser maior que zero.");
    if (!price || price <= 0) throw new Error("Preço deve ser maior que zero.");
    amount = r2(amount ?? qty * price);
  };
  const needAmount = () => {
    if (amount === null || !(amount > 0)) throw new Error("Valor deve ser maior que zero.");
    amount = r2(amount);
  };

  switch (e.kind) {
    case "buy": {
      needQtyPrice();
      h.cost_basis = r2(h.cost_basis + amount! + fees);
      h.quantity = r6(h.quantity + qty!);
      h.avg_price = r6(h.cost_basis / h.quantity);
      break;
    }
    case "sell": {
      needQtyPrice();
      if (qty! > h.quantity + 1e-9) throw new Error(`Venda de ${qty} maior que a posição atual (${h.quantity}).`);
      const costOut = h.quantity > 0 ? r2(h.cost_basis * (qty! / h.quantity)) : 0;
      realized = r2(amount! - fees - costOut);
      h.quantity = r6(h.quantity - qty!);
      h.cost_basis = h.quantity > 0 ? r2(h.cost_basis - costOut) : 0;
      if (h.quantity === 0) h.avg_price = 0;
      break;
    }
    case "contribution": {
      if (priced) throw new Error("Para ações, FIIs e ETFs registre compra (quantidade × preço).");
      needAmount();
      h.cost_basis = r2(h.cost_basis + amount! + fees);
      h.current_value = r2((h.current_value ?? 0) + amount!);
      h.current_value_at = e.trade_date;
      break;
    }
    case "redemption": {
      if (priced) throw new Error("Para ações, FIIs e ETFs registre venda (quantidade × preço).");
      needAmount();
      const before = h.current_value;
      if (before !== null && amount! > before + 0.005) throw new Error(`Resgate de ${amount} maior que o saldo registrado (${before}). Atualize o saldo antes.`);
      // Custo do que saiu: proporcional ao saldo; sem saldo conhecido, no máximo o custo.
      const costOut = before && before > 0 ? r2(h.cost_basis * Math.min(1, amount! / before)) : r2(Math.min(amount!, h.cost_basis));
      realized = r2(amount! - fees - costOut);
      h.cost_basis = r2(Math.max(0, h.cost_basis - costOut));
      h.current_value = before !== null ? r2(Math.max(0, before - amount!)) : null;
      h.current_value_at = e.trade_date;
      break;
    }
    case "balance": {
      if (priced) throw new Error("O valor de ações, FIIs e ETFs vem da cotação; registre compra ou venda.");
      if (amount === null || amount < 0) throw new Error("Saldo inválido.");
      amount = r2(amount);
      h.current_value = amount;
      h.current_value_at = e.trade_date;
      break;
    }
    case "dividend":
    case "income":
    case "fee": {
      needAmount();
      break;
    }
  }

  const entry: LedgerEntry = {
    market: e.market, asset_class: e.asset_class, code: e.code, kind: e.kind, trade_date: e.trade_date,
    quantity: qty, price, amount: amount ?? 0, fees, realized_pnl: realized,
    avg_price_after: priced ? h.avg_price : null, currency: h.currency, source: e.source ?? "manual", notes: e.notes ?? null,
  };
  if (e.name) h.name = e.name;
  if (e.cnpj) h.cnpj = e.cnpj;
  if (e.issuer) h.issuer = e.issuer;
  return { holding: h, entry };
}

export interface HoldingView extends Holding {
  price: number | null;
  value: number | null;
  /** Valorização não realizada (valor − custo). */
  unrealized: number | null;
  unrealizedPct: number | null;
  weight: number | null;
  income: number;
  realized: number;
}

export interface ClassView {
  asset_class: AssetClass;
  value: number;
  weight: number | null;
  target: number;
  /** Diferença em pontos percentuais (atual − meta). */
  gap: number | null;
  /** Quanto falta (ou sobra, negativo) para a classe chegar à meta com o patrimônio atual. */
  toTarget: number | null;
}

export interface PortfolioLedgerSummary {
  holdings: HoldingView[];
  classes: ClassView[];
  /** Patrimônio atual (só posições com valor conhecido). */
  currentValue: number;
  /** Posições sem cotação/saldo: o patrimônio fica parcial. */
  missingValues: string[];
  /** Dinheiro que entrou: compras + custos + aportes. */
  contributed: number;
  /** Dinheiro que voltou: vendas líquidas + resgates. */
  withdrawn: number;
  /** Capital aportado líquido = entrou − voltou. */
  netContributed: number;
  /** Dividendos + rendimentos − custos avulsos. */
  income: number;
  realized: number;
  unrealized: number;
  /** O que o mercado gerou: valor atual + voltou + renda − entrou. Null se o patrimônio estiver parcial. */
  marketGain: number | null;
  /** Retorno simples sobre o dinheiro que entrou (não é ponderado no tempo). */
  marketGainPct: number | null;
  largest: HoldingView | null;
  bestGain: HoldingView | null;
  worstLoss: HoldingView | null;
}

export function summarizeLedger(
  holdings: Holding[],
  entries: LedgerEntry[],
  prices: Record<string, number | null>,
  classTargets: Partial<Record<AssetClass, number>>,
): PortfolioLedgerSummary {
  const open = holdings.filter((h) => h.quantity > 0 || (h.current_value ?? 0) > 0 || h.cost_basis > 0);
  const byCode = (code: string, kinds: LedgerKind[]) => entries.filter((x) => x.code === code && kinds.includes(x.kind));
  const sum = (xs: number[]) => r2(xs.reduce((a, b) => a + b, 0));

  const missing: string[] = [];
  const views: HoldingView[] = open.map((h) => {
    const priced = PRICED.has(h.asset_class);
    const price = priced ? prices[h.code] ?? null : null;
    const value = priced ? (price !== null ? r2(h.quantity * price) : null) : h.current_value;
    if (value === null) missing.push(h.code);
    const unrealized = value !== null ? r2(value - h.cost_basis) : null;
    return {
      ...h, price, value, unrealized,
      unrealizedPct: unrealized !== null && h.cost_basis > 0 ? (unrealized / h.cost_basis) * 100 : null,
      weight: null,
      income: sum(byCode(h.code, ["dividend", "income"]).map((x) => x.amount)),
      realized: sum(byCode(h.code, ["sell", "redemption"]).map((x) => x.realized_pnl ?? 0)),
    };
  });
  const currentValue = sum(views.map((v) => v.value ?? 0));
  for (const v of views) v.weight = v.value !== null && currentValue > 0 ? (v.value / currentValue) * 100 : null;

  const amountOf = (kinds: LedgerKind[], withFees: 1 | -1 | 0) =>
    sum(entries.filter((x) => kinds.includes(x.kind)).map((x) => x.amount + withFees * x.fees));
  const contributed = r2(amountOf(["buy", "contribution"], 1));
  const withdrawn = r2(amountOf(["sell", "redemption"], -1));
  const income = r2(amountOf(["dividend", "income"], 0) - amountOf(["fee"], 0));
  const realized = sum(entries.map((x) => x.realized_pnl ?? 0));
  const unrealized = sum(views.map((v) => v.unrealized ?? 0));
  const marketGain = missing.length ? null : r2(currentValue + withdrawn + income - contributed);

  const targetSum = Object.values(classTargets).reduce((a, b) => a + (b ?? 0), 0);
  const classKeys = [...new Set([...Object.keys(classTargets), ...views.map((v) => v.asset_class)])] as AssetClass[];
  const classes: ClassView[] = classKeys.map((c) => {
    const value = sum(views.filter((v) => v.asset_class === c).map((v) => v.value ?? 0));
    const target = targetSum > 0 ? ((classTargets[c] ?? 0) / targetSum) * 100 : 0;
    const weight = currentValue > 0 ? (value / currentValue) * 100 : null;
    return {
      asset_class: c, value, weight, target,
      gap: weight !== null ? weight - target : null,
      toTarget: currentValue > 0 ? r2((target / 100) * currentValue - value) : null,
    };
  });

  const valued = views.filter((v) => v.value !== null);
  const by = (f: (v: HoldingView) => number) => (valued.length ? [...valued].sort((a, b) => f(b) - f(a))[0] : null);
  const best = by((v) => v.unrealized ?? -Infinity);
  const worst = by((v) => -(v.unrealized ?? Infinity));
  return {
    holdings: views.sort((a, b) => (b.value ?? 0) - (a.value ?? 0)),
    classes,
    currentValue, missingValues: missing, contributed, withdrawn,
    netContributed: r2(contributed - withdrawn), income, realized, unrealized, marketGain,
    marketGainPct: marketGain !== null && contributed > 0 ? (marketGain / contributed) * 100 : null,
    largest: by((v) => v.value ?? 0),
    bestGain: best && (best.unrealized ?? 0) > 0 ? best : null,
    worstLoss: worst && (worst.unrealized ?? 0) < 0 ? worst : null,
  };
}
