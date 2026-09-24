import type { MacroIndicator } from "../market/types";
import type { Momentum } from "./indicators";

export interface RegimeReading {
  key: string;
  label: string;
  tone: "positive" | "negative" | "neutral";
  basis: string;
}

export interface MacroImpact {
  ticker: string;
  direction: "negativo" | "positivo" | "misto" | "depende";
  mechanism: string;
}

export interface MacroDriverImpact {
  driver: string;
  impacts: MacroImpact[];
}

/** Leituras descritivas do regime — não são previsões. */
export function regimeReadings(ind: MacroIndicator[], spy: Momentum | null): RegimeReading[] {
  const by = (k: MacroIndicator["key"]) => ind.find((i) => i.key === k);
  const out: RegimeReading[] = [];
  if (spy) {
    const above200 = (spy.vs_sma200 ?? 0) > 0;
    const r1m = spy.ret_1m ?? 0;
    if (above200 && r1m >= 0) out.push({ key: "risk", label: "Mercado risk-on", tone: "positive", basis: `S&P 500 (via SPY) acima da SMA200 e ${r1m >= 0 ? "+" : ""}${r1m.toFixed(1)}% em 1 mês.` });
    else if (!above200 || r1m <= -7) out.push({ key: "risk", label: "Mercado risk-off", tone: "negative", basis: `S&P 500 (via SPY) ${above200 ? "acima" : "abaixo"} da SMA200 e ${r1m.toFixed(1)}% em 1 mês.` });
    else out.push({ key: "risk", label: "Mercado neutro", tone: "neutral", basis: `S&P 500 (via SPY) acima da SMA200 com ${r1m.toFixed(1)}% em 1 mês.` });
  }
  const vix = by("VIX");
  if (vix?.value != null) {
    if (vix.value >= 25) out.push({ key: "vol", label: "Volatilidade elevada", tone: "negative", basis: `VIX em ${vix.value.toFixed(1)}.` });
    else out.push({ key: "vol", label: "Volatilidade normal", tone: "neutral", basis: `VIX em ${vix.value.toFixed(1)}.` });
  } else if (spy?.volatility_60d != null) {
    const v = spy.volatility_60d;
    out.push({ key: "vol", label: v >= 22 ? "Volatilidade elevada" : "Volatilidade normal", tone: v >= 22 ? "negative" : "neutral", basis: `VIX indisponível; volatilidade realizada 60d do SPY: ${v.toFixed(0)}% a.a.` });
  }
  const ten = by("US10Y");
  if (ten?.change_1m != null) {
    const c = ten.change_1m;
    out.push({
      key: "rates",
      label: c >= 0.15 ? "Juros subindo" : c <= -0.15 ? "Juros caindo" : "Juros estáveis",
      tone: c >= 0.15 ? "negative" : c <= -0.15 ? "positive" : "neutral",
      basis: `Treasury 10 anos em ${ten.value?.toFixed(2)}% (${c >= 0 ? "+" : ""}${(c * 100).toFixed(0)} bps em 1 mês).`,
    });
  }
  const dxy = by("DXY");
  if (dxy?.change_1m != null) {
    const c = dxy.change_1m;
    out.push({
      key: "usd", label: c >= 1 ? "Dólar fortalecendo" : c <= -1 ? "Dólar enfraquecendo" : "Dólar estável", tone: "neutral",
      basis: `${dxy.proxy ? `Índice do dólar via ${dxy.proxy}` : "DXY"}: ${c >= 0 ? "+" : ""}${c.toFixed(1)}% em 1 mês.`,
    });
  }
  return out;
}

/** Mecanismos de transmissão por ativo — explicação, não seta colorida. */
export function macroImpacts(readings: RegimeReading[]): MacroDriverImpact[] {
  const labels = new Set(readings.map((r) => r.label));
  const out: MacroDriverImpact[] = [];
  const growth = ["META", "NVDA", "MSFT", "AAPL", "GOOGL"];

  if (labels.has("Juros subindo") || labels.has("Juros caindo")) {
    const up = labels.has("Juros subindo");
    out.push({
      driver: up ? "Juros americanos ↑" : "Juros americanos ↓",
      impacts: [
        { ticker: "LQD", direction: up ? "negativo" : "positivo", mechanism: `Preço de títulos se move no sentido oposto aos juros: com duration de vários anos, cada 1 p.p. de ${up ? "alta" : "queda"} nos yields tende a ${up ? "reduzir" : "aumentar"} o preço de mercado em aproximadamente a duration em %. O yield de reinvestimento ${up ? "sobe" : "cai"}.` },
        { ticker: "VNQ", direction: up ? "negativo" : "positivo", mechanism: `REITs dependem de financiamento e competem com renda fixa: juros ${up ? "maiores elevam custo de dívida e cap rates, pressionando avaliações" : "menores reduzem custo de dívida e tornam dividendos relativamente mais atraentes"}.` },
        { ticker: "JEPQ", direction: "depende", mechanism: "Combina ações do Nasdaq-100 com venda de opções: o efeito depende de como ações e volatilidade reagem aos juros. Volatilidade maior eleva o prêmio recebido, mas não protege de quedas das ações." },
        ...growth.map((t) => ({ ticker: t, direction: up ? "negativo" as const : "positivo" as const, mechanism: `Taxa de desconto ${up ? "maior reduz" : "menor aumenta"} o valor presente de lucros futuros — o valuation ${up ? "pode sofrer" : "pode expandir"} mesmo sem mudança nos fundamentos.` })),
        { ticker: "BRK.B", direction: "misto", mechanism: `Caixa e float de seguros ${up ? "rendem mais" : "rendem menos"} em T-bills; a carteira de ações é afetada pela taxa de desconto.` },
      ],
    });
  }
  if (labels.has("Dólar fortalecendo") || labels.has("Dólar enfraquecendo")) {
    const up = labels.has("Dólar fortalecendo");
    out.push({
      driver: up ? "Dólar ↑" : "Dólar ↓",
      impacts: [
        ...["AAPL", "MSFT", "GOOGL", "META", "NVDA"].map((t) => ({ ticker: t, direction: up ? "negativo" as const : "positivo" as const, mechanism: `Receita internacional convertida em menos${up ? "" : " (mais)"} dólares: dólar ${up ? "forte reduz" : "fraco aumenta"} a receita reportada.` })),
        { ticker: "Carteira (BRL)", direction: "depende", mechanism: "Para o investidor brasileiro, o efeito relevante é USD/BRL: dólar mais alto frente ao real aumenta o patrimônio medido em reais (retorno cambial), independentemente do desempenho dos ativos." },
      ],
    });
  }
  if (labels.has("Volatilidade elevada")) {
    out.push({
      driver: "Volatilidade ↑",
      impacts: [
        { ticker: "JEPQ", direction: "misto", mechanism: "Prêmios de opções ficam maiores (mais renda distribuível), mas o fundo continua exposto às quedas das ações e limita a participação em recuperações rápidas." },
        { ticker: "LQD", direction: "negativo", mechanism: "Em estresse, spreads de crédito corporativo tendem a abrir, reduzindo o preço mesmo que Treasuries subam." },
      ],
    });
  }
  return out;
}

/** Calendário macro publicado pelo Federal Reserve (FOMC 2026 — decisão no 2º dia). */
export const FOMC_2026 = [
  "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17",
  "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09",
];
