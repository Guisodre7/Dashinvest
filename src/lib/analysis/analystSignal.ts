import type { AnalystData } from "../market/types";
import type { EstimateTrend } from "./estimates";

export interface AnalystSignal {
  /** -1 (analistas piorando a visão) .. +1 (melhorando). null = sem dados. */
  score: number | null;
  /** (meta mais alta − mais baixa) ÷ meta média. Alta = muita incerteza. */
  dispersion: number | null;
}

const net = (r: { strong_buy: number; buy: number; hold: number; sell: number; strong_sell: number }) => {
  const total = r.strong_buy + r.buy + r.hold + r.sell + r.strong_sell;
  return total ? (2 * r.strong_buy + r.buy - r.sell - 2 * r.strong_sell) / (2 * total) : null;
};

/**
 * Analistas como sinal (não como preço-alvo): direção das revisões de lucro,
 * mudança do consenso em ~3 meses e saldo de upgrades/downgrades.
 */
export function analystSignal(trend: EstimateTrend | null, a: AnalystData | null): AnalystSignal {
  const parts: number[] = [];
  const rev = trend?.eps_rev_90d ?? trend?.eps_rev_30d ?? null;
  if (rev !== null) parts.push(rev >= 3 ? 0.6 : rev <= -3 ? -0.6 : rev / 5 * 0.6);
  const recs = a?.recommendations ?? [];
  if (recs.length >= 3) {
    const now = net(recs[0]), before = net(recs[Math.min(3, recs.length - 1)]);
    if (now !== null && before !== null) parts.push(Math.max(-0.4, Math.min(0.4, (now - before) * 2)));
  }
  if (a?.upgrades_90d != null && a.downgrades_90d != null && a.upgrades_90d + a.downgrades_90d > 0) {
    parts.push(((a.upgrades_90d - a.downgrades_90d) / (a.upgrades_90d + a.downgrades_90d)) * 0.3);
  }
  const score = parts.length ? Math.max(-1, Math.min(1, parts.reduce((x, y) => x + y, 0))) : null;
  const dispersion = a?.target_high && a.target_low && a.target_mean ? (a.target_high - a.target_low) / a.target_mean : null;
  return { score, dispersion };
}
