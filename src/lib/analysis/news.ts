import type { Impact, NewsCategory, NewsItem } from "../market/types";

/**
 * News Impact Engine — classifica notícias por categoria e impacto potencial
 * com base em recência, credibilidade da fonte, relação direta com a empresa
 * e gravidade do tema. É uma heurística transparente: os motivos da
 * classificação acompanham cada notícia.
 */

const TIER1 = ["reuters", "bloomberg", "financial times", "ft.com", "wall street journal", "wsj", "cnbc", "sec", "sec.gov", "federal reserve", "treasury", "businesswire", "business wire", "globenewswire", "pr newswire", "prnewswire", "associated press", "ap news"];
const TIER2 = ["marketwatch", "barron", "yahoo", "the information", "axios", "nikkei", "the verge", "techcrunch", "fortune", "forbes", "investopedia", "benzinga", "dow jones"];
const LOW_TRUST = ["seeking alpha", "motley fool", "fool.com", "zacks", "investorplace", "247wallst", "24/7 wall", "gurufocus", "insidermonkey", "stocknews", "kiplinger"];

export function sourceCredibility(source: string): { score: number; tier: 1 | 2 | 3 } {
  const s = source.toLowerCase();
  if (TIER1.some((t) => s.includes(t))) return { score: 1, tier: 1 };
  if (LOW_TRUST.some((t) => s.includes(t))) return { score: 0.35, tier: 3 };
  if (TIER2.some((t) => s.includes(t))) return { score: 0.7, tier: 2 };
  return { score: 0.5, tier: 3 };
}

const CATEGORY_RULES: [NewsCategory, RegExp][] = [
  ["EARNINGS", /\b(earnings|quarterly results|q[1-4] results|revenue beat|eps|guidance|profit|outlook|forecast)\b/i],
  ["LEGAL", /\b(lawsuit|sued|court|judge|settlement|probe|investigation|fine[ds]?|antitrust suit|class action|indict)/i],
  ["REGULATION", /\b(regulat|antitrust|ftc|doj|european commission|\beu\b|export (ban|control|restriction)|sanction|tariff|ban)\b/i],
  ["M&A", /\b(acquir|acquisition|merger|takeover|buyout|deal to buy|stake in)\b/i],
  ["MANAGEMENT", /\b(ceo|cfo|chief executive|resign|steps down|appoint|succession|board)\b/i],
  ["AI", /\b(ai\b|artificial intelligence|genai|llm|chatbot|gpu|data center|datacenter)/i],
  ["CAPEX", /\b(capex|capital expenditure|spending plan|investment plan|build(ing)? (a )?(new )?(plant|fab|data center))/i],
  ["SUPPLY CHAIN", /\b(supply chain|supplier|shortage|tsmc|foundry|production delay|chip supply)\b/i],
  ["INTEREST RATES", /\b(rate (cut|hike)|interest rate|fed funds|treasury yield|yields? (rise|fall|jump|drop))\b/i],
  ["MACRO", /\b(inflation|cpi|pce|gdp|jobs report|payrolls|unemployment|recession|fomc|federal reserve|powell)\b/i],
  ["CREDIT", /\b(credit|bond|downgrade to junk|spreads?|investment[- ]grade|default)\b/i],
  ["REAL ESTATE", /\b(reit|real estate|property|mortgage|office vacancy|housing)\b/i],
  ["COMPETITION", /\b(rival|competitor|competition|market share|compete)\b/i],
  ["PRODUCT", /\b(launch|unveil|release[sd]?|new (model|product|chip|device)|iphone|pixel|copilot|blackwell|rubin)\b/i],
];

const SEVERE_NEGATIVE = /\b(guidance cut|cuts? (its )?(guidance|forecast|outlook)|lowers? (guidance|forecast|outlook)|profit warning|fraud|sec charges|indict|recall|bankruptcy|default|halt(ed)? trading|restat|accounting (issue|irregular)|ceo (resign|ousted|fired)|export ban|breakup|break up|antitrust (ruling|loss))/i;
const NEGATIVE = /\b(downgrade|misses?|miss(ed)? estimates|falls?|drops?|plunges?|slump|tumbles?|lawsuit|probe|investigation|fine[ds]?|delay|weak|slowdown|layoffs?|cuts?)\b/i;
const POSITIVE = /\b(upgrade|beats?|raises? (guidance|forecast|outlook)|record (revenue|profit)|surge|jumps?|buyback|dividend (increase|hike)|wins? (contract|approval))\b/i;

const CATEGORY_WEIGHT: Record<NewsCategory, number> = {
  EARNINGS: 1, LEGAL: 0.9, REGULATION: 0.9, "M&A": 0.9, MANAGEMENT: 0.8, "INTEREST RATES": 0.8,
  MACRO: 0.7, CREDIT: 0.7, CAPEX: 0.7, "SUPPLY CHAIN": 0.7, AI: 0.6, COMPETITION: 0.6,
  PRODUCT: 0.5, "REAL ESTATE": 0.6, MARKET: 0.4,
};

export function categorize(n: Pick<NewsItem, "title" | "summary">): NewsCategory {
  const text = `${n.title} ${n.summary ?? ""}`;
  for (const [cat, re] of CATEGORY_RULES) if (re.test(n.title)) return cat;
  for (const [cat, re] of CATEGORY_RULES) if (re.test(text)) return cat;
  return "MARKET";
}

export type Polarity = "negative" | "positive" | "neutral";

export function polarity(n: NewsItem): { polarity: Polarity; severe: boolean; basis: "provider" | "heuristic" } {
  const text = `${n.title} ${n.summary ?? ""}`;
  const severe = SEVERE_NEGATIVE.test(text);
  if (n.provider_sentiment !== null) {
    const p: Polarity = n.provider_sentiment <= -0.15 ? "negative" : n.provider_sentiment >= 0.15 ? "positive" : "neutral";
    return { polarity: severe ? "negative" : p, severe, basis: "provider" };
  }
  if (severe) return { polarity: "negative", severe, basis: "heuristic" };
  const neg = NEGATIVE.test(n.title), pos = POSITIVE.test(n.title);
  return { polarity: neg && !pos ? "negative" : pos && !neg ? "positive" : "neutral", severe, basis: "heuristic" };
}

/** Meia-vida de 6 horas: notícia de 2 min pesa ~1, de 8h pesa ~0,4. */
export function recencyWeight(publishedAt: string, now = new Date()): number {
  const hours = Math.max(0, (now.getTime() - new Date(publishedAt).getTime()) / 3_600_000);
  return Math.pow(0.5, hours / 6);
}

export interface ScoredNews extends NewsItem {
  category: NewsCategory;
  impact: Impact;
  impact_score: number;
  impact_reasons: string[];
  polarity: Polarity;
  severe: boolean;
  credibility_tier: 1 | 2 | 3;
}

export function scoreNews(n: NewsItem, ticker: string | null, companyName?: string | null, now = new Date()): ScoredNews {
  const category = categorize(n);
  const cred = sourceCredibility(n.source);
  const rec = recencyWeight(n.published_at, now);
  const pol = polarity(n);
  const reasons: string[] = [];

  let relevance = n.provider_relevance ?? 0.5;
  const head = n.title.toLowerCase();
  const nameKey = companyName?.toLowerCase().split(/[ ,.]/)[0];
  if (ticker && (head.includes(ticker.toLowerCase()) || (nameKey && nameKey.length > 2 && head.includes(nameKey)))) {
    relevance = Math.max(relevance, 1);
    reasons.push("empresa citada no título");
  }
  const sevBoost = pol.severe ? 1.6 : pol.polarity === "negative" ? 1.15 : 1;
  const score = cred.score * (0.35 + 0.65 * rec) * (0.4 + 0.6 * relevance) * CATEGORY_WEIGHT[category] * sevBoost;

  reasons.push(`fonte ${cred.tier === 1 ? "de alta credibilidade" : cred.tier === 2 ? "reconhecida" : "de credibilidade limitada"} (${n.source})`);
  reasons.push(`publicada há ${formatHours(n.published_at, now)}`);
  if (pol.severe) reasons.push("tema de alta gravidade");
  reasons.push(`categoria ${category}`);

  let impact: Impact = "LOW";
  if (score >= 0.75 && cred.tier === 1) impact = "CRITICAL";
  else if (score >= 0.5) impact = "HIGH";
  else if (score >= 0.28) impact = "MEDIUM";

  return {
    ...n, category, impact, impact_score: score, impact_reasons: reasons,
    polarity: pol.polarity, severe: pol.severe, credibility_tier: cred.tier,
  };
}

function formatHours(iso: string, now: Date) {
  const min = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} dias`;
}

export function rankNews(items: NewsItem[], ticker: string | null, companyName?: string | null, now = new Date()): ScoredNews[] {
  return items.map((n) => scoreNews(n, ticker, companyName, now)).sort((a, b) => b.impact_score - a.impact_score);
}

/** Resumo das notícias recentes para o Opportunity Score. */
export function newsSignal(scored: ScoredNews[], hours = 72, now = new Date()) {
  const recent = scored.filter((n) => now.getTime() - new Date(n.published_at).getTime() <= hours * 3_600_000);
  const negHigh = recent.filter((n) => n.polarity === "negative" && (n.impact === "CRITICAL" || n.impact === "HIGH"));
  const posHigh = recent.filter((n) => n.polarity === "positive" && (n.impact === "CRITICAL" || n.impact === "HIGH"));
  const credible = recent.filter((n) => n.credibility_tier <= 2);
  return {
    count: recent.length,
    credible_count: credible.length,
    negative_high: negHigh,
    positive_high: posHigh,
    critical_negative: negHigh.some((n) => n.impact === "CRITICAL" || n.severe),
    /** -1..1 */
    score: recent.length ? Math.max(-1, Math.min(1, (posHigh.length - negHigh.length * 1.5) / 3)) : null,
  };
}
