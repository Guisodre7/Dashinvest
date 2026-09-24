import type { DailyBar } from "../market/types";

/** Indicadores técnicos — auxiliares; nunca substituem fundamentos. */

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    if (prev === null) {
      prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    } else {
      prev = values[i] * k + prev * (1 - k);
    }
    out.push(prev);
  }
  return out;
}

export function rsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgG = gain / period, avgL = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgL === 0) return 100;
  return 100 - 100 / (1 + avgG / avgL);
}

export function macd(closes: number[]): { macd: number; signal: number; histogram: number } | null {
  if (closes.length < 35) return null;
  const e12 = ema(closes, 12), e26 = ema(closes, 26);
  const line: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (e12[i] !== null && e26[i] !== null) line.push(e12[i]! - e26[i]!);
  }
  const sig = ema(line, 9);
  const m = line[line.length - 1], s = sig[sig.length - 1];
  if (s === null) return null;
  return { macd: m, signal: s, histogram: m - s };
}

export function atr(bars: DailyBar[], period = 14): number | null {
  if (bars.length <= period) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i], pc = bars[i - 1].close;
    trs.push(Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc)));
  }
  let a = trs.slice(0, period).reduce((x, y) => x + y, 0) / period;
  for (let i = period; i < trs.length; i++) a = (a * (period - 1) + trs[i]) / period;
  return a;
}

/** Volatilidade anualizada (%) dos retornos diários na janela. */
export function volatility(closes: number[], window = 60): number | null {
  if (closes.length < window + 1) return null;
  const slice = closes.slice(-window - 1);
  const rets = slice.slice(1).map((c, i) => Math.log(c / slice[i]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

function pct(a: number, b: number) {
  return ((a - b) / b) * 100;
}

export interface Momentum {
  ret_1d: number | null;
  ret_5d: number | null;
  ret_1m: number | null;
  ret_3m: number | null;
  ret_6m: number | null;
  ret_ytd: number | null;
  ret_1y: number | null;
  ret_60d: number | null;
  rsi14: number | null;
  macd: { macd: number; signal: number; histogram: number } | null;
  sma20: number | null;
  sma50: number | null;
  sma100: number | null;
  sma200: number | null;
  atr14: number | null;
  atr_pct: number | null;
  relative_volume: number | null;
  volatility_60d: number | null;
  /** Posição do preço em relação às médias (%), positivo = acima. */
  vs_sma50: number | null;
  vs_sma200: number | null;
}

/**
 * Calcula momentum a partir do histórico diário. `lastPrice` (cotação atual)
 * substitui o último fechamento quando fornecido.
 */
export function computeMomentum(bars: DailyBar[], lastPrice?: number | null): Momentum {
  const closes = bars.map((b) => b.close);
  if (lastPrice && closes.length) {
    const today = new Date().toISOString().slice(0, 10);
    if (bars[bars.length - 1].time === today) closes[closes.length - 1] = lastPrice;
    else closes.push(lastPrice);
  }
  const n = closes.length;
  const last = closes[n - 1];
  const back = (k: number) => (n > k ? pct(last, closes[n - 1 - k]) : null);
  const lastSma = (p: number) => (n >= p ? closes.slice(-p).reduce((a, b) => a + b, 0) / p : null);
  const year = new Date().getUTCFullYear();
  const firstOfYearIdx = bars.findIndex((b) => b.time.startsWith(String(year)));
  const ytdBase = firstOfYearIdx > 0 ? bars[firstOfYearIdx - 1].close : null;
  const a = atr(bars);
  const vol20 = bars.length >= 21 ? bars.slice(-21, -1).reduce((x, b) => x + b.volume, 0) / 20 : null;
  const s50 = lastSma(50), s200 = lastSma(200);
  return {
    ret_1d: back(1),
    ret_5d: back(5),
    ret_1m: back(21),
    ret_3m: back(63),
    ret_6m: back(126),
    ret_ytd: ytdBase ? pct(last, ytdBase) : null,
    ret_1y: back(252),
    ret_60d: back(42),
    rsi14: rsi(closes),
    macd: macd(closes),
    sma20: lastSma(20),
    sma50: s50,
    sma100: lastSma(100),
    sma200: s200,
    atr14: a,
    atr_pct: a && last ? (a / last) * 100 : null,
    relative_volume: vol20 && bars.length ? bars[bars.length - 1].volume / vol20 : null,
    volatility_60d: volatility(closes),
    vs_sma50: s50 ? pct(last, s50) : null,
    vs_sma200: s200 ? pct(last, s200) : null,
  };
}

export type DrawdownBand = "0-5%" | "5-10%" | "10-15%" | "15-20%" | "20-30%" | ">30%";

export interface Drawdown {
  from_52w_high: number | null; // % negativo ou 0
  from_52w_low: number | null; // % positivo
  from_ath: number | null;
  ath: number | null;
  /** true se a "máxima histórica" é apenas do histórico disponível. */
  ath_is_partial: boolean;
  dd_1m: number | null;
  dd_3m: number | null;
  dd_1y: number | null;
  band: DrawdownBand | null;
}

export function drawdownBand(ddPct: number): DrawdownBand {
  const d = Math.abs(ddPct);
  if (d < 5) return "0-5%";
  if (d < 10) return "5-10%";
  if (d < 15) return "10-15%";
  if (d < 20) return "15-20%";
  if (d < 30) return "20-30%";
  return ">30%";
}

export function computeDrawdown(
  bars: DailyBar[],
  price: number | null,
  opts: { week52High?: number | null; week52Low?: number | null; fullHistory?: boolean } = {},
): Drawdown {
  const last = price ?? bars[bars.length - 1]?.close ?? null;
  if (last === null) {
    return { from_52w_high: null, from_52w_low: null, from_ath: null, ath: null, ath_is_partial: true, dd_1m: null, dd_3m: null, dd_1y: null, band: null };
  }
  const maxHigh = (k: number) => {
    const s = bars.slice(-k);
    return s.length ? Math.max(...s.map((b) => b.high), last) : null;
  };
  const year = bars.slice(-252);
  const h52 = opts.week52High ?? (year.length >= 200 ? Math.max(...year.map((b) => b.high)) : null);
  const l52 = opts.week52Low ?? (year.length >= 200 ? Math.min(...year.map((b) => b.low)) : null);
  const ath = bars.length ? Math.max(...bars.map((b) => b.high), last, h52 ?? 0) : h52;
  const dd = (h: number | null) => (h ? Math.min(0, pct(last, h)) : null);
  const from52 = dd(h52 !== null ? Math.max(h52, last) : null);
  return {
    from_52w_high: from52,
    from_52w_low: l52 ? pct(last, l52) : null,
    from_ath: dd(ath),
    ath,
    ath_is_partial: !opts.fullHistory,
    dd_1m: dd(maxHigh(21)),
    dd_3m: dd(maxHigh(63)),
    dd_1y: dd(maxHigh(252)),
    band: from52 !== null ? drawdownBand(from52) : null,
  };
}
