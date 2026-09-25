/**
 * Validação e normalização (determinística, sem IA) dos dados extraídos de
 * um comprovante. Nunca inventa: o que não puder ser confirmado vira null e
 * gera um aviso para o usuário revisar.
 */

export interface RawTrade {
  is_trade_confirmation: boolean;
  side: "buy" | "sell" | "unknown";
  ticker: string | null;
  company_name: string | null;
  quantity: number | null;
  price: number | null;
  gross_amount: number | null;
  fees: number | null;
  total_amount: number | null;
  currency: string | null;
  trade_date: string | null;
  broker: string | null;
  fx_rate: number | null;
  /** Identificador da ordem/transação na corretora (evita registrar duas vezes). */
  trade_id?: string | null;
  notes: string | null;
}

export interface TradeDraft {
  ticker: string | null;
  quantity: number | null;
  price: number | null;
  fees: number | null;
  fx_rate: number | null;
  trade_date: string | null;
  broker: string | null;
  side: RawTrade["side"];
  total_amount: number | null;
  currency: string | null;
  company_name: string | null;
  trade_id: string | null;
}

export interface NormalizedTrade {
  ok: boolean;
  draft: TradeDraft;
  warnings: string[];
  /** Campos preenchidos a partir do comprovante. */
  filled: (keyof TradeDraft)[];
  /**
   * Leitura completa E conferida: compra, ativo cadastrado, quantidade, preço e data
   * presentes, e quantidade × preço bate com o valor do comprovante. Só assim o
   * registro pode ser automático.
   */
  verified: boolean;
}

const pos = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
const nonneg = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

/** "BRK B", "BRK-B", "brk/b" → "BRK.B"; remove prefixos de bolsa ("NASDAQ:NVDA"). */
export function normalizeTicker(t: string | null | undefined): string | null {
  if (!t) return null;
  let s = t.trim().toUpperCase().replace(/^[A-Z]+:/, "");
  s = s.replace(/[\s/-]+/g, ".").replace(/\.+/g, ".").replace(/^\.|\.$/g, "");
  return /^[A-Z]{1,6}(\.[A-Z])?$/.test(s) ? s : null;
}

export function normalizeTrade(raw: RawTrade, knownTickers: string[], today = new Date()): NormalizedTrade {
  const warnings: string[] = [];
  if (!raw.is_trade_confirmation) {
    return {
      ok: false,
      draft: emptyDraft(),
      warnings: ["A imagem não parece ser um comprovante de compra/venda de ativo. Envie a tela de confirmação da ordem ou a nota da corretora."],
      filled: [],
      verified: false,
    };
  }

  const ticker = normalizeTicker(raw.ticker);
  if (raw.ticker && !ticker) warnings.push(`Ticker "${raw.ticker}" não reconhecido — selecione manualmente.`);
  if (ticker && !knownTickers.includes(ticker)) warnings.push(`${ticker} não está cadastrado na estratégia. Cadastre em Estratégia → Adicionar ativo antes de registrar.`);

  let quantity = pos(raw.quantity);
  let price = pos(raw.price);
  const fees = nonneg(raw.fees);
  const gross = pos(raw.gross_amount);
  const total = pos(raw.total_amount);

  // Completa um campo faltante só quando os outros dois estão explícitos no comprovante.
  if (quantity && !price && gross) { price = gross / quantity; warnings.push("Preço por cota calculado a partir do valor bruto ÷ quantidade."); }
  if (!quantity && price && gross) { quantity = gross / price; warnings.push("Quantidade calculada a partir do valor bruto ÷ preço — confira as frações."); }

  let amountChecked = false;
  if (quantity && price) {
    const ref = gross ?? (total !== null && fees !== null ? total - fees : null);
    if (ref) amountChecked = Math.abs(quantity * price - ref) / ref <= 0.015;
    if (ref && !amountChecked) {
      warnings.push(`Quantidade × preço (${(quantity * price).toFixed(2)}) difere do valor do comprovante (${ref.toFixed(2)}). Confira os números.`);
    }
  }

  const currency = raw.currency?.toUpperCase() ?? null;
  if (currency && currency !== "USD") warnings.push(`Valores em ${currency} — o registro usa US$. Confira preço e taxas.`);

  let trade_date: string | null = null;
  if (raw.trade_date && /^\d{4}-\d{2}-\d{2}$/.test(raw.trade_date)) {
    const d = new Date(`${raw.trade_date}T12:00:00Z`);
    if (!Number.isNaN(d.getTime()) && d.getTime() <= today.getTime() + 86_400_000) trade_date = raw.trade_date;
    else warnings.push("Data do comprovante inválida ou no futuro — confira.");
  } else if (raw.trade_date) {
    warnings.push(`Data "${raw.trade_date}" não reconhecida — confira.`);
  }

  const fx = pos(raw.fx_rate);
  if (fx !== null && (fx < 1 || fx > 20)) warnings.push("Câmbio fora da faixa esperada para R$/US$ — ignorado.");
  const fx_rate = fx !== null && fx >= 1 && fx <= 20 ? fx : null;

  if (raw.side === "sell") warnings.push("O comprovante parece ser de VENDA. Este formulário registra compras — não registre sem conferir.");
  if (raw.side === "unknown") warnings.push("Não foi possível confirmar se é compra ou venda.");
  if (raw.notes) warnings.push(`Observação da leitura: ${raw.notes}`);

  const draft: TradeDraft = {
    ticker, quantity, price, fees, fx_rate, trade_date,
    broker: raw.broker?.trim() || null, side: raw.side, total_amount: total, currency,
    company_name: raw.company_name?.trim() || null,
    trade_id: raw.trade_id ?? null,
  };
  const filled = (["ticker", "quantity", "price", "fees", "fx_rate", "trade_date", "broker"] as const).filter((k) => draft[k] !== null);
  if (!ticker || !quantity || !price) warnings.unshift("Leitura incompleta: preencha os campos que ficaram vazios.");
  const verified = warnings.length === 0 && raw.side === "buy" && !!ticker && knownTickers.includes(ticker)
    && !!quantity && !!price && !!trade_date && amountChecked;
  return { ok: filled.length > 0, draft, warnings, filled: [...filled], verified };
}

function emptyDraft(): TradeDraft {
  return { ticker: null, quantity: null, price: null, fees: null, fx_rate: null, trade_date: null, broker: null, side: "unknown", total_amount: null, currency: null, company_name: null, trade_id: null };
}
