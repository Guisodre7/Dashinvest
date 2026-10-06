import type { BandKey, Stance } from "../analysis/stance";

// ---------------------------------------------------------------------------
// Diário de teses
// ---------------------------------------------------------------------------

export type PremiseStatus = "mantida" | "enfraquecida" | "quebrada" | "sem avaliação";

export interface Thesis {
  id: string;
  market: "US" | "BR";
  ticker: string;
  created_at: string;
  /** Contexto no dia em que a tese foi escrita. */
  price: number | null;
  quantity: number | null;
  band: BandKey | null;
  quality: Stance["quality"] | null;
  text: string;
  premises: string[];
  expectation: string | null;
  risks: string[];
  changeMyMind: string | null;
  horizon: string | null;
  status: "ativa" | "encerrada";
  reviews: ThesisReview[];
}

export interface ThesisReview {
  date: string;
  price: number | null;
  statuses: PremiseStatus[];
  note: string | null;
  conclusion: ThesisConclusion;
}

export type ThesisConclusion = "Tese preservada" | "Tese parcialmente comprometida" | "Tese significativamente comprometida" | "Sem avaliação";

/** Conclusão da revisão a partir do status de cada premissa. */
export function reviewConclusion(statuses: PremiseStatus[]): ThesisConclusion {
  const rated = statuses.filter((s) => s !== "sem avaliação");
  if (!rated.length) return "Sem avaliação";
  const broken = rated.filter((s) => s === "quebrada").length;
  const weak = rated.filter((s) => s === "enfraquecida").length;
  if (broken >= Math.max(1, Math.ceil(rated.length / 2))) return "Tese significativamente comprometida";
  if (broken > 0 || weak > 0) return "Tese parcialmente comprometida";
  return "Tese preservada";
}

// ---------------------------------------------------------------------------
// "Foi uma boa entrada?" — julgada pelo que se sabia na data, não pelo resultado
// ---------------------------------------------------------------------------

export interface EntrySnapshot { band: BandKey | null; quality: Stance["quality"]; thesis: Stance["thesis"]; fair: number | null }

export interface EntryReview {
  decision: "Boa decisão" | "Decisão razoável" | "Decisão arriscada" | "Sem registro da época";
  decisionWhy: string;
  outcome: string;
  /** Resultado e decisão podem divergir — a mensagem explica quando isso acontece. */
  lesson: string | null;
}

const fmt = (v: number, d = 1) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

export function reviewEntry(buy: { date: string; price: number }, atBuy: EntrySnapshot | null, now: { price: number | null; band: BandKey | null; thesis: Stance["thesis"] }): EntryReview {
  const change = now.price ? (now.price / buy.price - 1) * 100 : null;
  const outcome = change === null ? "Sem preço atual." : `Preço ${change >= 0 ? "+" : ""}${fmt(change)}% desde a compra · tese hoje: ${now.thesis}`;
  if (!atBuy) return { decision: "Sem registro da época", decisionWhy: "A análise da data da compra não foi registrada (o histórico diário começou depois). Só o resultado pode ser mostrado — e resultado não mede a qualidade da decisão.", outcome, lesson: null };

  const goodBand = atBuy.band === "forte" || atBuy.band === "atrativo";
  const okBand = atBuy.band === "justo";
  const goodQuality = atBuy.quality === "excelente" || atBuy.quality === "boa" || atBuy.quality === "sem dados";
  let decision: EntryReview["decision"];
  let why: string;
  if (atBuy.thesis === "deteriorada") { decision = "Decisão arriscada"; why = "Na data, os dados já indicavam deterioração dos fundamentos."; }
  else if (goodBand && goodQuality) { decision = "Boa decisão"; why = "Na data, o preço estava em faixa atrativa e a qualidade era boa: havia margem de segurança."; }
  else if ((goodBand || okBand) && atBuy.quality !== "fraca") { decision = "Decisão razoável"; why = "Na data, o preço era razoável em relação ao valor estimado."; }
  else if (atBuy.band === "esticado" || atBuy.band === "extremo") { decision = "Decisão arriscada"; why = `Na data, o valuation já estava ${atBuy.band === "extremo" ? "extremamente " : ""}esticado: pouca margem de segurança.`; }
  else { decision = "Decisão razoável"; why = "Dados da época incompletos para um julgamento firme."; }

  let lesson: string | null = null;
  if (change !== null) {
    if (decision === "Boa decisão" && change < -10) lesson = "Boa decisão com resultado negativo até agora: com a informação da época, a compra era racional. Verifique se a tese mudou antes de concluir algo.";
    if (decision === "Decisão arriscada" && change > 10) lesson = "Resultado positivo, mas a decisão tinha pouca margem de segurança: o ganho não torna a entrada boa em retrospecto.";
  }
  return { decision, decisionWhy: why, outcome, lesson };
}

// ---------------------------------------------------------------------------
// Analisar compra — veredito
// ---------------------------------------------------------------------------

export type VerdictKey = "atrativa" | "parcial" | "esperar" | "nao_aumentar" | "sem_dados";
export const VERDICT_META: Record<VerdictKey, { label: string; emoji: string }> = {
  atrativa: { label: "COMPRA ATRATIVA", emoji: "🟢" },
  parcial: { label: "COMPRA PARCIAL", emoji: "🟡" },
  esperar: { label: "ESPERAR MELHOR PREÇO", emoji: "🟠" },
  nao_aumentar: { label: "NÃO AUMENTAR POSIÇÃO", emoji: "🔴" },
  sem_dados: { label: "DADOS INSUFICIENTES", emoji: "⚪" },
};

export interface PurchaseVerdict {
  key: VerdictKey;
  why: string[];
  /** Entrada em partes (quando faz sentido). */
  plan: { label: string; pct: number; price: number | null }[];
}

export function purchaseVerdict(s: Stance, ctx: { weightAfter: number | null; target: number; maxWeight: number | null; dataStale: boolean }): PurchaseVerdict {
  const why: string[] = [s.headline];
  const outside = ctx.target <= 0;
  const over = !outside && ctx.weightAfter !== null && ctx.maxWeight !== null && ctx.weightAfter > ctx.maxWeight;
  const aboveTarget = !outside && ctx.weightAfter !== null && ctx.weightAfter > ctx.target * 1.1;
  if (outside && s.action !== "legado") why.push(`Ativo fora da estratégia (sem meta de peso)${ctx.weightAfter !== null ? `: depois da compra pesaria ${fmt(ctx.weightAfter)}% da carteira` : ""}. Se for manter, defina a meta em Estratégia.`);
  const bands = s.bands;
  const zone = (k: BandKey) => bands.find((b) => b.key === k);
  if (over) why.push(`Depois da compra a posição pesaria ${fmt(ctx.weightAfter!)}% — acima do máximo de ${fmt(ctx.maxWeight!)}%.`);
  else if (aboveTarget) why.push(`Depois da compra a posição ficaria acima da meta (${fmt(ctx.weightAfter!)}% × ${fmt(ctx.target)}%).`);
  if (ctx.dataStale) why.push("⚠️ Cotação desatualizada: confirme o preço antes de decidir.");

  let key: VerdictKey;
  switch (s.action) {
    case "comprar": case "recompra":
      key = over ? "parcial" : s.thesis === "não verificável" || s.thesis === "em observação" ? "parcial" : "atrativa";
      if (key === "parcial" && !over) why.push("Tese não verificada automaticamente: uma entrada parcelada reduz o risco de timing.");
      break;
    case "manter":
      key = aboveTarget || over ? "esperar" : "parcial";
      if (key === "parcial") why.push("Preço razoável, sem grande margem de segurança: dividir a entrada reduz o risco de timing.");
      break;
    case "nao_aumentar": key = "esperar"; break;
    case "realizacao": case "reduzir": case "evitar": case "sair": key = "nao_aumentar"; break;
    case "legado": key = "nao_aumentar"; why.push("Posição legada: fora dos aportes por definição da estratégia."); break;
    default: key = "sem_dados";
  }
  const plan: PurchaseVerdict["plan"] = [];
  if (key === "parcial") {
    plan.push({ label: "Agora", pct: 40, price: null });
    plan.push({ label: "Se cair até a faixa atrativa", pct: 30, price: zone("atrativo")?.high ?? null });
    plan.push({ label: "Se cair até compra forte", pct: 30, price: zone("forte")?.high ?? null });
  }
  if (key === "esperar") {
    const a = zone("atrativo"), j = zone("justo");
    if (j?.high) why.push(`Faixa de compra normal até ${fmt(j.high, 2)}; atrativa até ${fmt(a?.high ?? 0, 2)}.`);
  }
  return { key, why, plan };
}
