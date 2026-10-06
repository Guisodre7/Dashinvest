import type { AssetAnalysis } from "../analysis/analyze";
import type { Stance } from "../analysis/stance";
import type { MacroIndicator } from "../market/types";
import { CLASS_LABEL, type PortfolioLedgerSummary } from "../portfolio/ledger";
import type { Candidate } from "./rules";

const fmtPct = (v: number, d = 1) => `${v > 0 ? "+" : ""}${v.toFixed(d).replace(".", ",")}%`;
/** "🟢 Possível compressão" → "possível compressão" (sem emoji repetido no texto). */
const plain = (title: string) => title.replace(/^[^\p{L}]+/u, "").replace(/^\p{Lu}/u, (c) => c.toLowerCase());

/**
 * Converte as análises da carteira internacional em candidatos a notificação.
 * Movimento de preço sozinho NUNCA gera candidato: só sinais que combinam
 * preço com valuation, fundamentos, estimativas ou eventos.
 * FATO e INTERPRETAÇÃO ficam separados no texto.
 */
export function usCandidates(analyses: AssetAnalysis[], now = new Date()): Candidate[] {
  const out: Candidate[] = [];
  for (const a of analyses) {
    const t = a.ticker;
    const url = `/ativo/${encodeURIComponent(t)}`;
    for (const s of a.signals) {
      switch (s.kind) {
        case "OPPORTUNITY":
        case "VALUATION_COMPRESSION":
          out.push({
            category: "opportunity", priority: "high", market: "US", ticker: t, url, key: `${t}:opportunity`,
            title: `Oportunidade: ${t}`,
            body: `${t} entrou em faixa de análise: ${plain(s.title)}. ${s.message} Fundamentos e estimativas foram recalculados — não é ordem de compra.`,
            publicBody: `${t} entrou em faixa de valuation considerada interessante. Toque para ver a análise.`,
            reason: `Sinal ${s.kind}`,
          });
          break;
        case "ANTI_FOMO":
          // Alta acompanhada por estimativas (severidade baixa) não vira alerta.
          if (s.severity === "LOW") break;
          out.push({
            category: "valuation", priority: "medium", market: "US", ticker: t, url, key: `${t}:valuation`,
            title: `Valuation esticado: ${t}`,
            body: `Preço avançou mais rápido que os fundamentos observáveis. ${s.message} Não significa vender: reavaliar risco/retorno e evitar aumentar a posição por impulso.`,
            publicBody: `${t}: preço avançou mais rápido que os fundamentos. Toque para ver a análise.`,
            reason: "Sinal ANTI_FOMO sem revisão proporcional das estimativas",
          });
          break;
        case "THESIS_CHANGE":
        case "THESIS_DETERIORATION":
        case "CORRECTION_FUNDAMENTAL":
          out.push({
            category: "thesis", priority: s.kind === "THESIS_CHANGE" ? "critical" : "high", market: "US", ticker: t, url, key: `${t}:thesis:${s.kind}`,
            title: `Mudança potencial de tese: ${t}`,
            body: `${s.title}. ${s.message} Queda com deterioração não é oportunidade automática. Análise necessária.`,
            publicBody: `Novo evento pode alterar uma premissa da tese de ${t}. Análise necessária.`,
            reason: `Sinal ${s.kind}`,
          });
          break;
        case "EARNINGS_SOON": {
          const ev = a.events.find((e) => e.kind === "earnings");
          if (a.daysToEarnings === null || a.daysToEarnings > 2 || !ev) break;
          out.push({
            category: "earnings", priority: "medium", market: "US", ticker: t, url, key: `${t}:earnings:${ev.date}`,
            title: `Resultado: ${t} em ${a.daysToEarnings === 0 ? "hoje" : `${a.daysToEarnings} dia(s)`}`,
            body: `${ev.title} em ${ev.date.split("-").reverse().join("/")}${ev.time ? ` (${ev.time})` : ""}. Resultado e guidance podem mudar estimativas e valuation.`,
            reason: "Earnings em até 2 dias",
          });
          break;
        }
        case "ABOVE_MAX_WEIGHT":
          out.push({
            category: "portfolio", priority: "medium", market: "US", ticker: t, url: "/", key: `${t}:portfolio:max`,
            title: `Carteira internacional: ${t} acima do peso máximo`,
            body: `${s.message} Os próximos aportes podem priorizar ativos abaixo da meta.`,
            publicBody: `${t} passou do peso máximo definido. Toque para ver a alocação.`,
            reason: "Peso atual acima do máximo da estratégia",
          });
          break;
      }
    }
    // Revisão relevante de lucro esperado (fundamento, não preço).
    const rev = a.trend.eps_rev_30d;
    if (rev !== null && Math.abs(rev) >= 6) {
      out.push({
        category: "thesis", priority: rev < 0 ? "high" : "medium", market: "US", ticker: t, url, key: `${t}:eps:${rev < 0 ? "down" : "up"}`,
        title: `${t}: lucro esperado revisado ${fmtPct(rev)} em 30 dias`,
        body: `FATO: consenso de EPS (${a.trend.period}) mudou ${fmtPct(rev)} em 30 dias. INTERPRETAÇÃO: ${rev < 0 ? "revisão negativa forte pesa na tese e no valuation" : "revisão positiva pode justificar parte da alta"}.`,
        reason: "Revisão de estimativa ≥ 6% em 30 dias",
      });
    }
    // Notícias: só de impacto alto/crítico e publicadas nas últimas 48h.
    for (const n of a.news) {
      if (n.impact !== "CRITICAL" && n.impact !== "HIGH") continue;
      const ageH = (now.getTime() - new Date(n.published_at).getTime()) / 3_600_000;
      if (!(ageH >= 0 && ageH <= 48)) continue;
      out.push({
        category: n.category === "EARNINGS" ? "earnings" : "news",
        priority: n.impact === "CRITICAL" ? "high" : "medium", market: "US", ticker: t, url,
        key: `${t}:news:${n.id.slice(-40)}`,
        title: `${t}: ${n.title.slice(0, 90)}`,
        body: `FATO: ${n.title} (${n.source}, ${new Date(n.published_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}). INTERPRETAÇÃO DO MODELO: notícia de ${n.category.toLowerCase()} com impacto ${n.impact === "CRITICAL" ? "crítico" : "alto"} (${n.impact_reasons.slice(0, 2).join(", ")}). Avaliar dentro da tese — manchete não é recomendação.`,
        reason: `Notícia ${n.impact} · ${n.category}`,
      });
    }
  }
  return out;
}

/** Carteira Brasil: classe muito distante da meta (≥ 10 p.p.). */
export function brCandidates(summary: PortfolioLedgerSummary): Candidate[] {
  if (summary.currentValue <= 0) return [];
  const out: Candidate[] = [];
  for (const c of summary.classes) {
    if (c.weight === null || c.gap === null || Math.abs(c.gap) < 10 || c.target <= 0 && c.weight <= 0) continue;
    const label = CLASS_LABEL[c.asset_class];
    const under = summary.classes.filter((x) => x.gap !== null && x.gap < -2).map((x) => (x.asset_class === "fii" ? "FIIs" : CLASS_LABEL[x.asset_class].toLowerCase()));
    out.push({
      category: "portfolio", priority: "medium", market: "BR", ticker: null, url: "/brasil",
      key: `BR:portfolio:${c.asset_class}:${c.gap > 0 ? "over" : "under"}`,
      title: `Carteira Brasil: ${label} ${c.gap > 0 ? "acima" : "abaixo"} da meta`,
      body: `${label} representa ${c.weight.toFixed(0)}% da carteira. Sua meta atual é ${c.target.toFixed(0)}%.${c.gap > 0 && under.length ? ` O próximo aporte pode priorizar ${under.join(" e ")}.` : ""}`,
      publicBody: `${label} está distante da meta da Carteira Brasil. Toque para ver a alocação.`,
      reason: `Desvio de ${c.gap.toFixed(1)} p.p. da meta`,
    });
  }
  return out;
}

/** Macro: só mudanças grandes (juros 10 anos ±0,5 p.p. ou dólar ±5% no mês). */
export function macroCandidates(macro: MacroIndicator[]): Candidate[] {
  const out: Candidate[] = [];
  const ten = macro.find((m) => m.key === "US10Y");
  if (ten?.change_1m != null && Math.abs(ten.change_1m) >= 0.5) {
    out.push({
      category: "macro", priority: "medium", market: "US", ticker: null, url: "/#macro", key: `MACRO:US10Y:${ten.change_1m > 0 ? "up" : "down"}`,
      title: `Juros dos EUA ${ten.change_1m > 0 ? "subiram" : "caíram"} ${Math.abs(ten.change_1m).toFixed(2).replace(".", ",")} p.p. no mês`,
      body: `FATO: Treasury 10 anos em ${ten.value?.toFixed(2).replace(".", ",")}% (fonte: ${ten.meta?.source ?? "—"}). INTERPRETAÇÃO: juros ${ten.change_1m > 0 ? "maiores pressionam valuation de growth, REITs (VNQ) e títulos (LQD)" : "menores aliviam valuation de growth, REITs e títulos"}.`,
      reason: "Variação de juros ≥ 0,5 p.p. em 1 mês",
    });
  }
  const fx = macro.find((m) => m.key === "USDBRL");
  if (fx?.change_1m != null && Math.abs(fx.change_1m) >= 5) {
    out.push({
      category: "macro", priority: "medium", market: null, ticker: null, url: "/geral", key: `MACRO:USDBRL:${fx.change_1m > 0 ? "up" : "down"}`,
      title: `Dólar ${fx.change_1m > 0 ? "subiu" : "caiu"} ${Math.abs(fx.change_1m).toFixed(1).replace(".", ",")}% no mês`,
      body: `FATO: USD/BRL em ${fx.value?.toFixed(4).replace(".", ",")}. INTERPRETAÇÃO: muda o valor em reais de toda a carteira internacional e o custo dos próximos aportes no exterior.`,
      reason: "Câmbio ±5% em 1 mês",
    });
  }
  return out;
}

export const TEST_CANDIDATE: Candidate = {
  category: "market", priority: "high", market: null, ticker: null, url: "/notificacoes", key: "TEST",
  title: "🔔 DashInvest conectado", body: "As notificações estão funcionando corretamente.", reason: "Teste manual",
};

const money = (v: number) => `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Postura de valuation: realização parcial / redução / recompra. */
export function stanceCandidates(stances: Stance[]): Candidate[] {
  const out: Candidate[] = [];
  for (const s of stances) {
    const url = `/ativo/${encodeURIComponent(s.ticker)}#realizacao`;
    if ((s.action === "realizacao" || s.action === "reduzir") && s.realization) {
      const r = s.realization;
      out.push({
        category: "realization", priority: "high", market: "US", ticker: s.ticker, url, key: `${s.ticker}:realization:${s.action}`,
        title: s.action === "reduzir" ? `Avaliar redução: ${s.ticker}` : `Valuation esticado: ${s.ticker}`,
        body: `${s.headline} Faixa sugerida para avaliação: ${r.pctLow}%–${r.pctHigh}% da posição (${money(r.valueLow)}–${money(r.valueHigh)}). Imposto estimado ${money(r.estTax)}. Não é ordem.`,
        publicBody: `${s.ticker} continua com fundamentos ${s.quality === "excelente" || s.quality === "boa" ? "sólidos" : "a acompanhar"}, mas o valuation entrou em faixa esticada. Avaliar realização parcial.`,
        reason: `Postura ${s.action} · faixa ${s.band} · qualidade ${s.quality} · tese ${s.thesis}`,
      });
    }
    if (s.action === "recompra" && s.rebuy) {
      out.push({
        category: "rebuy", priority: "high", market: "US", ticker: s.ticker, url, key: `${s.ticker}:rebuy`,
        title: `Possível recompra: ${s.ticker}`,
        body: `${s.ticker} retornou à faixa de valuation considerada interessante. Fundamentos permanecem preservados. Venda anterior a ${money(s.rebuy.sellPrice)}; preço ${s.rebuy.dropFromSellPct.toFixed(1).replace(".", ",")}% em relação à venda. Recompra em degraus.`,
        publicBody: `${s.ticker} retornou à faixa de valuation considerada interessante. Fundamentos permanecem preservados.`,
        reason: `Postura recompra · faixa ${s.band} · tese ${s.thesis}`,
      });
    }
  }
  return out;
}

/**
 * Degraus da estratégia de escada atingidos pelo preço atual.
 * Venda: só com posição. Recompra: só depois de uma venda feita após salvar o plano.
 */
export function ladderCandidates(
  ladders: Record<string, { sell: { price: number; pct: number }[]; rebuy: { price: number; pct: number }[]; updated_at?: string }>,
  prices: Record<string, number | null>,
  ctx: { held: (ticker: string) => boolean; lastSellDate: (ticker: string) => string | null },
): Candidate[] {
  const out: Candidate[] = [];
  for (const [t, l] of Object.entries(ladders)) {
    const p = prices[t];
    if (!p) continue;
    const planDay = (l.updated_at ?? "").slice(0, 10);
    const sold = ctx.lastSellDate(t);
    const canRebuy = !!sold && sold >= planDay;
    const url = `/ativo/${encodeURIComponent(t)}#realizacao`;
    const sellHit = ctx.held(t) ? [...l.sell].filter((x) => p >= x.price).sort((a, b) => b.price - a.price)[0] : undefined;
    if (sellHit) out.push({
      category: "realization", priority: "high", market: "US", ticker: t, url, key: `${t}:ladder:sell:${sellHit.price}`,
      title: `Degrau de venda atingido: ${t}`,
      body: `Preço ${money(p)} chegou ao degrau de ${money(sellHit.price)} do seu plano (vender ~${sellHit.pct}% da posição). Reavalie valuation e tese antes de decidir.`,
      publicBody: `${t} chegou a um degrau de venda do seu plano. Toque para ver a análise.`,
      reason: "Estratégia de escada (plano salvo)",
    });
    const rebuyHit = canRebuy ? [...l.rebuy].filter((x) => p <= x.price).sort((a, b) => a.price - b.price)[0] : undefined;
    if (rebuyHit) out.push({
      category: "rebuy", priority: "high", market: "US", ticker: t, url, key: `${t}:ladder:rebuy:${rebuyHit.price}`,
      title: `Degrau de recompra atingido: ${t}`,
      body: `Preço ${money(p)} chegou ao degrau de ${money(rebuyHit.price)} do seu plano (recomprar ~${rebuyHit.pct}% do vendido). Confirme se a tese segue preservada.`,
      publicBody: `${t} chegou a um degrau de recompra do seu plano. Toque para ver a análise.`,
      reason: "Estratégia de escada (plano salvo)",
    });
  }
  return out;
}
