import { PARAMS } from "../analysis/params";

/**
 * Quanto do aporte mensal vai para cada carteira (Brasil × Exterior).
 * Base: corrigir o desvio da meta Brasil/Exterior com o próprio aporte.
 * Ajuste (pequeno, explicado): o lado com mais ativos em faixa atrativa pelo valuation recebe
 * um pouco mais. Câmbio aparece só como contexto (spec §19: sem market timing cambial).
 */
export interface SplitInput {
  totalBrl: number;
  brValue: number;
  usValueBrl: number;
  /** Meta da parcela Brasil (0–100). */
  targetBrPct: number;
  fxRate: number | null;
  fxChange1m: number | null;
  brOpportunities: number;
  usOpportunities: number;
}

export interface SplitResult { brBrl: number; usBrl: number; usUsd: number | null; brPctNow: number | null; reasons: string[] }

const r50 = (v: number) => Math.round(v / 50) * 50;
const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export function splitMonthly(i: SplitInput): SplitResult {
  const amt = i.totalBrl;
  const cur = i.brValue + i.usValueBrl;
  const t = Math.min(100, Math.max(0, i.targetBrPct)) / 100;
  const reasons: string[] = [];
  const brPctNow = cur > 0 ? (i.brValue / cur) * 100 : null;
  const gapBr = t * (cur + amt) - i.brValue;
  let br = Math.min(amt, Math.max(0, gapBr));
  reasons.push(brPctNow === null
    ? `Sem patrimônio ainda: divisão pela meta (${fmt(t * 100)}% Brasil).`
    : `Hoje: ${fmt(brPctNow)}% Brasil × meta ${fmt(t * 100)}%. O aporte corrige o desvio primeiro (sem vender nada).`);

  // Câmbio é contexto, nunca regra mecânica (spec §19): a exposição internacional existe para
  // diversificação e proteção cambial — o dólar subir ou cair não muda a divisão sozinho.
  if (i.fxChange1m !== null && Math.abs(i.fxChange1m) >= 5) {
    reasons.push(`Contexto: dólar ${i.fxChange1m > 0 ? "subiu" : "caiu"} ${Math.abs(i.fxChange1m).toFixed(1).replace(".", ",")}% no mês. Não muda a divisão automaticamente — sem market timing cambial.`);
  }
  // Onde o próximo real tem melhor relação risco/retorno (spec §13): o lado com mais ativos em
  // faixa atrativa pelo valuation recebe um pouco mais.
  const T = PARAMS.split;
  let tilt = 0;
  const oppDiff = i.brOpportunities - i.usOpportunities;
  if (oppDiff !== 0) {
    tilt = Math.max(-T.opportunityTilt, Math.min(T.opportunityTilt, oppDiff * T.opportunityTiltPerAsset));
    reasons.push(`${tilt > 0 ? "Brasil" : "Exterior"} tem mais ativos em faixa atrativa pelo valuation (${i.brOpportunities} × ${i.usOpportunities}): +${fmt(Math.abs(tilt) * 100)}% do aporte para esse lado.`);
  }
  br = Math.min(amt, Math.max(0, br + tilt * amt));
  const brBrl = r50(br);
  const usBrl = Math.max(0, r50(amt) - brBrl);
  if (!i.fxRate) reasons.push("Câmbio indisponível: valor em dólares não calculado.");
  return { brBrl, usBrl, usUsd: i.fxRate ? Math.round((usBrl / i.fxRate) * 100) / 100 : null, brPctNow, reasons };
}
