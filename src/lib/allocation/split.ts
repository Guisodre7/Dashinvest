/**
 * Quanto do aporte mensal vai para cada carteira (Brasil × Exterior).
 * Base: corrigir o desvio da meta Brasil/Exterior com o próprio aporte.
 * Ajustes de contexto (pequenos, explicados, nunca previsão):
 *  - dólar subiu ≥ 5% no mês → 10% do aporte a menos no exterior (evita concentrar compra num pico de curto prazo); caiu ≥ 5% → 10% a mais;
 *  - lado com mais ativos em faixa atrativa recebe até 10% a mais.
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

  let tilt = 0;
  if (i.fxChange1m !== null && i.fxChange1m >= 5) { tilt += 0.1; reasons.push(`Dólar subiu ${i.fxChange1m.toFixed(1).replace(".", ",")}% no mês: 10% a menos para o exterior neste mês (não é previsão — só evita concentrar compra num pico de curto prazo).`); }
  if (i.fxChange1m !== null && i.fxChange1m <= -5) { tilt -= 0.1; reasons.push(`Dólar caiu ${Math.abs(i.fxChange1m).toFixed(1).replace(".", ",")}% no mês: 10% a mais para o exterior.`); }
  const oppDiff = i.brOpportunities - i.usOpportunities;
  if (oppDiff !== 0) {
    const o = Math.max(-0.1, Math.min(0.1, oppDiff * 0.05));
    tilt += o;
    reasons.push(`${o > 0 ? "Brasil" : "Exterior"} tem mais ativos em faixa atrativa (${i.brOpportunities} × ${i.usOpportunities}): +${fmt(Math.abs(o) * 100)}% do aporte para esse lado.`);
  }
  tilt = Math.max(-0.2, Math.min(0.2, tilt));
  br = Math.min(amt, Math.max(0, br + tilt * amt));
  const brBrl = r50(br);
  const usBrl = Math.max(0, r50(amt) - brBrl);
  if (!i.fxRate) reasons.push("Câmbio indisponível: valor em dólares não calculado.");
  return { brBrl, usBrl, usUsd: i.fxRate ? Math.round((usBrl / i.fxRate) * 100) / 100 : null, brPctNow, reasons };
}
