import "server-only";
import { getBrRates } from "../market/brRates";
import { impliedGrowth } from "../analysis/dcf";
import { brStanceOne } from "../analysis/brStance";
import { computeStance, type Stance } from "../analysis/stance";
import { parseTaxSettings, usStanceInput } from "../analysis/stanceInput";
import type { SessionUser } from "../auth";
import { getBrFundamentals } from "../market/brFundamentals";
import { getBrQuotes } from "../market/brapi";
import { loadBrazil } from "./brazil";
import { loadContext } from "./load";
import { TAX_KEY } from "./stances";

/** Tudo o que a tela "Analisar compra" e a revisão de tese precisam sobre um ativo. */
export interface DecisionPacket {
  market: "US" | "BR";
  ticker: string;
  name: string | null;
  currency: "US$" | "R$";
  price: number | null;
  priceIsOverride: boolean;
  changePct: number | null;
  priceAsOf: string | null;
  priceSource: string | null;
  dataStale: boolean;
  from52wHigh: number | null;
  from52wLow: number | null;
  stance: Stance;
  position: { quantity: number; avgCost: number; value: number | null; pnl: number | null; weight: number | null } | null;
  target: number;
  maxWeight: number | null;
  /** Peso relevante para a meta (carteira estratégica US ou carteira Brasil) e o total dessa carteira. */
  portfolioTotal: number;
  metrics: { label: string; value: string }[];
  growth: string[];
  news: { title: string; source: string; date: string; impact: string; url: string | null }[];
  events: { title: string; date: string }[];
  arguments: string[];
  risks: string[];
  sources: string[];
  notFound: string | null;
}

const f = (v: number | null | undefined, d = 1, suf = "") => (v === null || v === undefined ? "—" : `${v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })}${suf}`);

export async function loadDecision(user: SessionUser, market: "US" | "BR", ticker: string, priceOverride: number | null): Promise<DecisionPacket> {
  return market === "US" ? loadUs(user, ticker, priceOverride) : loadBr(user, ticker, priceOverride);
}

async function loadUs(user: SessionUser, ticker: string, priceOverride: number | null): Promise<DecisionPacket> {
  const ctx = await loadContext(user, { tickers: [ticker] });
  const a = ctx.analyses.find((x) => x.ticker === ticker);
  const [transactions, rawTax] = await Promise.all([ctx.repo.getTransactions(1000).catch(() => []), ctx.repo.getSetting(TAX_KEY).catch(() => null)]);
  if (!a || (!a.price && !a.fundamentals)) {
    return empty("US", ticker, "US$", `Sem dados para ${ticker} nos fornecedores (ticker inexistente ou fora da cobertura gratuita).`);
  }
  const input = usStanceInput(a, ctx.portfolio, transactions, parseTaxSettings(rawTax));
  const price = priceOverride ?? a.price;
  // Preço simulado: refaz o DCF reverso nesse preço (o crescimento embutido muda com o preço).
  const fv = a.fairValue;
  const impliedGap = priceOverride !== null && price && fv.fcf_per_share && fv.discount_rate && fv.base_growth != null
    ? (impliedGrowth(price, fv.fcf_per_share, fv.discount_rate) ?? 0) - fv.base_growth : input.impliedGap;
  const stance = computeStance({ ...input, price, impliedGap });
  const p = ctx.portfolio.positions.find((x) => x.ticker === ticker);
  const strategicTotal = ctx.portfolio.strategicUsd;
  const v = a.valuation, q = a.quality, t = a.trend;
  const metrics = [
    { label: "P/L", value: f(v.pe) }, { label: "P/L projetado", value: f(v.forward_pe) }, { label: "P/S", value: f(v.ps) },
    { label: "EV/EBITDA", value: f(v.ev_ebitda) }, { label: "Dividend yield", value: f(v.dividend_yield, 2, "%") },
    ...(q ? q.metrics.filter((m) => m.value !== null).slice(0, 6).map((m) => ({ label: m.label, value: `${f(m.value)}${m.unit === "%" ? "%" : "x"} (${m.assessment})` })) : []),
  ];
  const growth = [
    t.expected_eps_growth !== null ? `Crescimento de lucro (EPS) esperado: ${f(t.expected_eps_growth, 1, "%")} (próximo ano fiscal × atual).` : null,
    t.expected_revenue_growth !== null ? `Crescimento de receita esperado: ${f(t.expected_revenue_growth, 1, "%")}.` : null,
    t.eps_rev_90d !== null ? `Revisão do lucro esperado em 90 dias: ${f(t.eps_rev_90d, 1, "%")}.` : null,
    a.consensus ? `Consenso de analistas: ${a.consensus.buy} compra / ${a.consensus.hold} neutro / ${a.consensus.sell} venda (consenso não é recomendação).` : null,
  ].filter((x): x is string => !!x);
  const args: string[] = [];
  const risks: string[] = [];
  if (stance.quality === "excelente" || stance.quality === "boa") args.push(`Qualidade do negócio ${stance.quality} (rentabilidade, margens, balanço).`);
  if ((t.expected_eps_growth ?? 0) >= 10) args.push("Lucro esperado crescendo dois dígitos.");
  if (t.direction === "rising") args.push("Estimativas de lucro sendo revisadas para cima.");
  if (stance.band === "forte" || stance.band === "atrativo") args.push("Preço com margem de segurança em relação ao valor justo estimado.");
  if (stance.band === "esticado" || stance.band === "extremo") risks.push("Valuation acima da faixa justa: expectativa já incorporada ao preço.");
  if (t.direction === "falling" || t.significant_cut) risks.push("Estimativas de lucro em queda.");
  if (stance.thesis === "deteriorada") risks.push("Sinais de deterioração dos fundamentos.");
  if (a.daysToEarnings !== null && a.daysToEarnings <= 7) risks.push(`Resultado em ${a.daysToEarnings} dia(s): volatilidade e possível mudança de estimativas.`);
  if (q?.metrics.some((m) => m.key === "debt_to_equity" && m.assessment === "fraco")) risks.push("Endividamento elevado.");
  if (stance.rally === "expectativa") risks.push("Alta recente mais rápida que os fundamentos.");
  return {
    market: "US", ticker, name: a.name, currency: "US$", price, priceIsOverride: priceOverride !== null,
    changePct: a.quote?.change_pct ?? null, priceAsOf: a.quote?.meta.timestamp ?? null, priceSource: a.quote?.meta.source ?? null,
    dataStale: a.freshness.blocksPriceDecisions && priceOverride === null,
    from52wHigh: a.drawdown?.from_52w_high ?? null, from52wLow: a.drawdown?.from_52w_low ?? null,
    stance,
    position: p && p.quantity > 0 ? { quantity: p.quantity, avgCost: p.costUsd / p.quantity, value: p.valueUsd, pnl: p.pnlUsd, weight: a.strategy.is_legacy ? p.weightTotal : p.weightStrategic } : null,
    target: a.targetWeight, maxWeight: a.strategy.max_weight ?? (a.targetWeight ? a.targetWeight * 1.5 : null), portfolioTotal: strategicTotal,
    metrics, growth,
    news: [...a.news].sort((x, y) => (y.impact_score ?? 0) - (x.impact_score ?? 0)).slice(0, 4).map((n) => ({ title: n.title, source: n.source, date: n.published_at, impact: n.impact, url: n.url })),
    events: a.events.slice(0, 3).map((e) => ({ title: e.title, date: e.date })),
    arguments: args, risks, sources: a.sources, notFound: null,
  };
}

async function loadBr(user: SessionUser, code: string, priceOverride: number | null): Promise<DecisionPacket> {
  const ctx = await loadContext(user);
  const br = await loadBrazil(ctx.repo);
  const [{ data, errors }, rawTax, q, rates] = await Promise.all([
    getBrFundamentals([code]), ctx.repo.getSetting(TAX_KEY).catch(() => null),
    br.quotes[code] !== undefined ? Promise.resolve({ quotes: br.quotes, errors: br.quoteErrors }) : getBrQuotes([code]),
    getBrRates(),
  ]);
  const quote = q.quotes[code] ?? null;
  const fund = data[code] ?? null;
  if (!quote && !fund) return empty("BR", code, "R$", `Sem cotação nem fundamentos para ${code} (${q.errors[code] ?? errors[code] ?? "sem resposta"}).`);
  const quotes = { ...q.quotes, [code]: priceOverride !== null && quote ? { ...quote, price: priceOverride } : quote };
  const view = brStanceOne(code, br.strategy, br.summary, br.entries, quotes, data, parseTaxSettings(rawTax), undefined, rates?.real ?? null, rates?.ipca12m ?? null);
  if (priceOverride !== null && !quote) view.price = priceOverride;
  const h = br.summary.holdings.find((x) => x.code === code);
  const fu = fund;
  const inStrategy = br.strategy.assets.some((x) => x.enabled && x.code === code);
  const brTarget = inStrategy ? br.strategy.classes[view.assetClass] / (br.strategy.assets.filter((x) => x.enabled && x.asset_class === view.assetClass).length || 1) : 0;
  const metrics = !fu ? [] : fu.kind === "fii"
    ? [{ label: "P/VP", value: f(fu.pvp, 2) }, { label: "VP/cota", value: `R$ ${f(fu.vpa, 2)}` }, { label: "DY 12m", value: f(fu.dy, 1, "%") }, { label: "Vacância", value: f(fu.vacancy, 1, "%") }, { label: "Imóveis", value: f(fu.properties, 0) }, { label: "Cap rate", value: f(fu.capRate, 1, "%") }]
    : [{ label: "P/L", value: f(fu.pl, 2) }, { label: "P/VP", value: f(fu.pvp, 2) }, { label: "DY 12m", value: f(fu.dy, 1, "%") }, { label: "ROE", value: f(fu.roe, 1, "%") }, { label: "ROIC", value: f(fu.roic, 1, "%") }, { label: "Margem líquida", value: f(fu.netMargin, 1, "%") }, { label: "Dív. bruta/patrimônio", value: f(fu.grossDebtToEquity, 2) }, { label: "Crescimento receita 5a", value: f(fu.revenueGrowth5y, 1, "%") }];
  const s = view.stance;
  const args: string[] = [], risks: string[] = [];
  if (s.quality === "excelente" || s.quality === "boa") args.push(`Qualidade ${s.quality} pelos indicadores disponíveis.`);
  if (s.band === "forte" || s.band === "atrativo") args.push("Preço abaixo do valor estimado (margem de segurança).");
  if (fu?.dy && fu.dy >= 8) args.push(`Renda: dividend yield de ${f(fu.dy, 1, "%")} nos últimos 12 meses.`);
  if (fu?.kind === "fii" && fu.pvp !== null && fu.pvp < 1) args.push("Negociado abaixo do valor patrimonial.");
  if (s.band === "esticado" || s.band === "extremo") risks.push("Preço acima da faixa justa estimada.");
  if (fu?.kind === "fii" && (fu.vacancy ?? 0) > 10) risks.push(`Vacância elevada (${f(fu.vacancy, 1, "%")}).`);
  if (fu?.kind === "acao" && (fu.grossDebtToEquity ?? 0) > 1.5) risks.push("Endividamento elevado.");
  if (s.thesis === "não verificável") risks.push("Sem estimativas de lucro na fonte gratuita: tese não verificável automaticamente — confira resultados e notícias.");
  if (!fu) risks.push(`Fundamentos indisponíveis (${errors[code] ?? "sem resposta"}).`);
  return {
    market: "BR", ticker: code, name: view.name, currency: "R$", price: view.price, priceIsOverride: priceOverride !== null,
    changePct: quote?.change_pct ?? null, priceAsOf: quote?.meta.timestamp ?? null, priceSource: quote?.meta.source ?? (fu ? "fundamentus" : null),
    dataStale: false, from52wHigh: null, from52wLow: null, stance: s,
    position: h && h.quantity > 0 ? { quantity: h.quantity, avgCost: h.avg_price, value: h.value, pnl: h.unrealized, weight: h.weight } : null,
    target: brTarget, maxWeight: brTarget ? brTarget * 1.5 : null, portfolioTotal: br.summary.currentValue,
    metrics, growth: [], news: [], events: [],
    arguments: args, risks, sources: [quote?.meta.source, fu ? "fundamentus" : null].filter((x): x is string => !!x), notFound: null,
  };
}

function empty(market: "US" | "BR", ticker: string, currency: "US$" | "R$", reason: string): DecisionPacket {
  return {
    market, ticker, name: null, currency, price: null, priceIsOverride: false, changePct: null, priceAsOf: null, priceSource: null, dataStale: false,
    from52wHigh: null, from52wLow: null,
    stance: computeStance({ ticker, isEtf: false, isLegacy: false, price: null, fair: null, qualityScore: null, qualityCoverage: 0, signalKinds: [], estimates: { direction: "unknown", significantCut: false, epsRev90d: null }, priceChange6m: null, weight: null, target: 0, maxWeight: null, position: null, lastSell: null, tax: { feePerOrder: 0, gainTaxRate: 0, monthlyExemption: null, minTicket: 0, note: "" }, currency }),
    position: null, target: 0, maxWeight: null, portfolioTotal: 0, metrics: [], growth: [], news: [], events: [], arguments: [], risks: [], sources: [], notFound: reason,
  };
}
