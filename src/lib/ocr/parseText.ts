import type { RawTrade } from "./normalize";

/**
 * Extrai os dados de uma ordem a partir do TEXTO de um comprovante (obtido por
 * OCR local, PDF ou texto colado). Regras determinísticas, sem IA e sem custo.
 * Só preenche o que encontra explicitamente; o resto fica null.
 */

const BROKERS = [
  "Interactive Brokers", "IBKR", "Charles Schwab", "Schwab", "Avenue", "Nomad", "Inter", "XP", "Rico", "BTG", "C6",
  "Itaú", "Itau", "Clear", "Toro", "Stake", "Passfolio", "Revolut", "Robinhood", "Fidelity", "Wise", "Warren", "Sofisa",
];

/** Número em formato pt-BR (1.234,56) ou en-US (1,234.56). */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(s)) return null;
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // O último separador é o decimal.
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma > -1) {
    // "2,5" decimal · "1,250" milhar (3 dígitos após a vírgula e sem outra vírgula decimal)
    const after = s.length - lastComma - 1;
    s = after === 3 && s.split(",").length === 2 && !/^0,/.test(s) ? s.replace(",", "") : s.replace(/,/g, (m, i) => (i === lastComma ? "." : ""));
  } else if (lastDot > -1 && s.split(".").length > 2) {
    s = s.replace(/\./g, ""); // 1.250.000
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const NUM = String.raw`(-?\d[\d.,]*\d|\d)`;
const MONEY_PREFIX = String.raw`(?:US\$|U\$|USD|\$|R\$)?\s*`;

function findNumberAfter(text: string, labels: string[], maxGap = 25): number | null {
  for (const label of labels) {
    const re = new RegExp(`${label}[^\\d\\n-]{0,${maxGap}}${MONEY_PREFIX}${NUM}`, "i");
    const m = text.match(re);
    if (m) {
      const v = parseAmount(m[1]);
      if (v !== null) return v;
    }
  }
  return null;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, fev: 2, mar: 3, apr: 4, abr: 4, may: 5, mai: 5, jun: 6, jul: 7, aug: 8, ago: 8,
  sep: 9, set: 9, oct: 10, out: 10, nov: 11, dec: 12, dez: 12,
};

const iso = (y: number, m: number, d: number) =>
  m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;

function findDate(text: string, portuguese: boolean, notes: string[]): string | null {
  let m = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = text.match(/\b(\d{1,2})\s*(?:de\s+)?([a-zç]{3})[a-zç]*\.?\s*(?:de\s+)?(20\d{2})\b/i);
  if (m && MONTHS[m[2].toLowerCase()]) return iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  m = text.match(/\b([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})\b/i);
  if (m && MONTHS[m[1].toLowerCase()]) return iso(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
  m = text.match(/\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2}|\d{2})\b/);
  if (m) {
    const a = +m[1], b = +m[2], y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (a > 12) return iso(y, b, a); // dd/mm
    if (b > 12) return iso(y, a, b); // mm/dd
    if (a !== b) notes.push(`Data ${m[0]} ambígua (dia/mês) — interpretada no formato ${portuguese ? "brasileiro" : "americano"}.`);
    return portuguese ? iso(y, b, a) : iso(y, a, b);
  }
  return null;
}

function tickerVariants(t: string): string[] {
  if (!t.includes(".")) return [t];
  const [a, b] = t.split(".");
  return [t, `${a} ${b}`, `${a}-${b}`, `${a}/${b}`, `${a}${b}`];
}

export function parseTradeText(text: string, knownTickers: string[]): RawTrade {
  const notes: string[] = [];
  const clean = text.replace(/\r/g, "").replace(/[‐‑–—]/g, "-");
  const upper = clean.toUpperCase();
  const portuguese = /\b(COMPRA|VENDA|QUANTIDADE|PREÇO|PRECO|TAXAS?|CORRETAGEM|VALOR|DATA|ORDEM|EXECUTADA)\b/.test(upper);

  // Lado da operação
  const buy = /\b(COMPRA|COMPRADO|BUY|BOUGHT|PURCHASE)\b/.test(upper);
  const sell = /\b(VENDA|VENDIDO|SELL|SOLD)\b/.test(upper);
  const side: RawTrade["side"] = buy && !sell ? "buy" : sell && !buy ? "sell" : "unknown";

  // Ticker: prioriza os cadastrados na estratégia; depois "Symbol/Ativo: XXX".
  let ticker: string | null = null;
  let bestPos = Infinity;
  for (const t of knownTickers) {
    for (const v of tickerVariants(t)) {
      const re = new RegExp(`(?<![A-Z0-9])${v.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(?![A-Z0-9])`);
      const m = re.exec(upper);
      if (m && m.index < bestPos) { bestPos = m.index; ticker = t; }
    }
  }
  if (!ticker) {
    const m = upper.match(/\b(?:SYMBOL|TICKER|ATIVO|PAPEL|STOCK)\s*[:-]?\s*([A-Z]{1,5}(?:[.\s/-][A-Z])?)\b/);
    if (m) ticker = m[1];
  }

  // Quantidade e preço — rótulos pt/en e o formato "10 BRK B @ 480.25".
  // "shares/cotas" vêm DEPOIS do número — tratados abaixo.
  let quantity = findNumberAfter(clean, ["quantidade", "qtd\\.?", "qtde\\.?", "quantity", "qty\\.?", "n[ºo°]\\s*de\\s*(?:cotas|ações|acoes)"]);
  let price = findNumberAfter(clean, ["preço médio", "preco medio", "preço de execução", "preço unitário", "preço", "preco", "avg\\.? price", "average price", "execution price", "fill price", "price"]);
  const at = upper.match(new RegExp(String.raw`(?:BOUGHT|SOLD|BUY|SELL|COMPRA|VENDA)?\s*${NUM}\s*(?:SHARES?\s*(?:OF\s*)?)?[A-Z]{1,5}(?:[\s./-][A-Z])?\s*@\s*${MONEY_PREFIX}${NUM}`));
  if (at) {
    quantity ??= parseAmount(at[1]);
    price ??= parseAmount(at[2]);
  }
  // "0.8734 shares at $57.12" · "3 cotas a US$ 54,10"
  const sharesAt = clean.match(new RegExp(`${NUM}\\s*(?:shares?|cotas?|ações|acoes|units?)(?:\\s+(?:de|of|do)\\s+[A-Za-z]{1,6}(?:[.\\s/-][A-Za-z])?)?\\s*(?:at|a|@|por)\\s*${MONEY_PREFIX}${NUM}`, "i"));
  if (sharesAt) {
    quantity ??= parseAmount(sharesAt[1]);
    price ??= parseAmount(sharesAt[2]);
  }
  if (quantity === null) {
    const m = clean.match(new RegExp(`${NUM}\\s*(?:shares?|cotas?|ações|acoes|units?)\\b`, "i"));
    if (m) quantity = parseAmount(m[1]);
  }

  const gross = findNumberAfter(clean, ["valor bruto", "gross amount", "principal", "subtotal", "valor da operação"]);
  const total = findNumberAfter(clean, ["valor total", "total debitado", "net amount", "valor líquido", "valor liquido", "total"]);
  // "Taxa de câmbio" não é taxa da operação.
  let fees = findNumberAfter(clean, ["taxas?(?!\\s*d[eo]\\s*c[âa]mbio)", "corretagem", "emolumentos", "commission", "fees?"]);
  if (fees === null && /\b(sem taxa|zero fee|no commission|commission[- ]free|isento de taxa|taxa zero)/i.test(clean)) fees = 0;

  const fx = findNumberAfter(clean, ["taxa de câmbio", "taxa de cambio", "câmbio", "cambio", "cotação do dólar", "exchange rate", "vet"], 20);

  const currency = /US\$|U\$|\bUSD\b|\$\s*\d/.test(clean) ? "USD" : /R\$|\bBRL\b/.test(clean) ? "BRL" : null;
  const trade_date = findDate(clean, portuguese, notes);
  const broker = BROKERS.find((b) => new RegExp(`\\b${b}\\b`, "i").test(clean)) ?? null;

  const found = [ticker, quantity, price, total, gross].filter((x) => x !== null).length;
  return {
    is_trade_confirmation: found >= 2 || (found >= 1 && side !== "unknown"),
    side,
    ticker,
    company_name: null,
    quantity,
    price,
    gross_amount: gross,
    fees,
    total_amount: total,
    currency,
    trade_date,
    broker: broker === "IBKR" ? "Interactive Brokers" : broker,
    fx_rate: fx,
    notes: notes.length ? notes.join(" ") : null,
  };
}
