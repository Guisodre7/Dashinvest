import { PARAMS } from "./params";
import { median } from "./robust";

/**
 * Fluxo de caixa descontado (DCF) simples por ação, em duas fases:
 * anos 1–5 crescendo a g, anos 6–10 convergindo linearmente para a perpetuidade,
 * e valor terminal (Gordon). O fluxo é o FCF por ação (para o acionista) e a taxa é o
 * custo de equity — fluxo e taxa consistentes (spec §10). A taxa vem dos juros de mercado,
 * nunca escolhida para chegar a um preço.
 */
export const TERMINAL_GROWTH = PARAMS.valuation.terminalGrowth;
export const EQUITY_PREMIUM = PARAMS.valuation.equityPremium;

/** Custo de equity: Treasury 10 anos + beta (0,8–1,5) × prêmio de risco, dentro do intervalo de PARAMS. */
export function discountRate(riskFreePct: number, beta: number | null): number {
  const b = Math.max(0.8, Math.min(1.5, beta ?? 1));
  const [lo, hi] = PARAMS.valuation.discountRange;
  return Math.max(lo, Math.min(hi, riskFreePct / 100 + b * EQUITY_PREMIUM));
}

export function dcfPerShare(fcf: number, g: number, r: number, terminal = TERMINAL_GROWTH): number {
  let pv = 0, cash = fcf, growth = g;
  for (let y = 1; y <= 10; y++) {
    if (y > 5) growth = g + ((terminal - g) * (y - 5)) / 5;
    cash *= 1 + growth;
    pv += cash / (1 + r) ** y;
  }
  const tv = (cash * (1 + terminal)) / (r - terminal);
  return pv + tv / (1 + r) ** 10;
}

/** DCF reverso: crescimento anual (anos 1–5) que o preço atual embute. */
export function impliedGrowth(price: number, fcf: number, r: number): number | null {
  if (fcf <= 0 || price <= 0) return null;
  let lo = -0.1, hi = 0.6;
  if (dcfPerShare(fcf, hi, r) < price) return hi; // embute mais de 60% a.a.
  if (dcfPerShare(fcf, lo, r) > price) return lo;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (dcfPerShare(fcf, mid, r) > price) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

/** Crescimento base: mediana do que a empresa entregou e do que se espera, 0%–20% a.a. */
export function baseGrowth(candidatesPct: (number | null | undefined)[]): number | null {
  const v = candidatesPct.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  if (!v.length) return null;
  return Math.max(0, Math.min(0.2, median(v) / 100));
}
